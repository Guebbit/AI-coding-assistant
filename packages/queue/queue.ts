import { randomUUID } from "node:crypto";
import { emit } from "../events/bus";
import { getLogger } from "../logger/logger";
import type { Agent, AgentRunOptions } from "../agent/agent";
import type { Job, JobOptions, QueueStats, RunMode } from "./types";

const log = getLogger("queue");

// ── All-night preset defaults ──────────────────────────────────────────────

/** Step budget for all_night mode (override with AGENTS_ALL_NIGHT_MAX_STEPS). */
const ALL_NIGHT_MAX_STEPS = Number.parseInt(
  process.env.AGENTS_ALL_NIGHT_MAX_STEPS ?? "25",
  10,
);
/** Consecutive tool failures allowed in all_night mode before giving up. */
const ALL_NIGHT_MAX_TOOL_FAILURES = 5;
/** Wall-clock timeout for all_night jobs: 8 hours in ms. */
const ALL_NIGHT_TIMEOUT_MS = 8 * 60 * 60 * 1000;

// ── Queue configuration ────────────────────────────────────────────────────

/**
 * Maximum number of jobs processed concurrently.
 * Default 1 — process one job at a time to avoid overwhelming Ollama.
 * Override with AGENT_QUEUE_CONCURRENCY.
 */
const DEFAULT_CONCURRENCY = Number.parseInt(
  process.env.AGENT_QUEUE_CONCURRENCY ?? "1",
  10,
);

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Expand a JobOptions + RunMode combination into concrete AgentRunOptions.
 * Explicit per-job values always win over the mode-level defaults.
 */
function resolveAgentRunOptions(
  options: JobOptions,
): AgentRunOptions & { allowWrite: boolean } {
  const mode: RunMode = options.mode ?? "normal";

  if (mode === "all_night") {
    return {
      allowWrite: options.allowWrite ?? false,
      maxSteps: options.maxSteps ?? ALL_NIGHT_MAX_STEPS,
      maxToolFailures: options.maxToolFailures ?? ALL_NIGHT_MAX_TOOL_FAILURES,
      timeoutMs: options.timeoutMs ?? ALL_NIGHT_TIMEOUT_MS,
    };
  }

  // normal mode — pass only the values that were explicitly provided so the
  // agent's own defaults (AGENTS_MAX_STEPS env var etc.) remain in control.
  return {
    allowWrite: options.allowWrite ?? false,
    ...(options.maxSteps !== undefined ? { maxSteps: options.maxSteps } : {}),
    ...(options.maxToolFailures !== undefined
      ? { maxToolFailures: options.maxToolFailures }
      : {}),
    ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
  };
}

// ── JobQueue ───────────────────────────────────────────────────────────────

/**
 * In-process FIFO job queue for agent tasks.
 *
 * Features:
 * - Submit individual tasks or whole batches via the API.
 * - Configurable concurrency (default 1 — safe for single-GPU setups).
 * - Per-job `maxSteps`, `maxToolFailures`, and `timeoutMs` overrides.
 * - `all_night` mode preset for unattended overnight runs.
 * - Cancel queued or running jobs at any time.
 * - Observable lifecycle via the shared event bus.
 *
 * All state is in-process.  Restart the API to clear the queue.
 * Migrate to a persistent store (Redis / BullMQ) when durability is needed.
 */
export class JobQueue {
  /** All jobs ever submitted, keyed by id. */
  private readonly jobs = new Map<string, Job>();
  /** IDs of jobs waiting to be processed, in submission order. */
  private readonly pending: string[] = [];
  /** IDs of jobs currently being processed. */
  private readonly running = new Set<string>();
  /** AbortControllers for running jobs, keyed by job id. */
  private readonly controllers = new Map<string, AbortController>();

  private readonly concurrency: number;
  private readonly createAgent: (allowWrite: boolean) => Agent;

  constructor(
    createAgent: (allowWrite: boolean) => Agent,
    concurrency: number = DEFAULT_CONCURRENCY,
  ) {
    this.createAgent = createAgent;
    this.concurrency = Math.max(1, concurrency);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Enqueue a single task.
   *
   * Returns the Job record immediately; processing happens in the background.
   * Poll `GET /queue/jobs/:id` for status and result.
   */
  submit(task: string, options: JobOptions = {}): Job {
    const id = randomUUID();
    const job: Job = {
      id,
      task: task.trim(),
      options,
      status: "queued",
      createdAt: new Date().toISOString(),
    };
    this.jobs.set(id, job);
    this.pending.push(id);
    log.info("job_queued", {
      id,
      mode: options.mode ?? "normal",
      taskPreview: task.slice(0, 80),
      queueLength: this.pending.length,
    });
    emit({ type: "queue:job_queued", payload: { id, task } });
    this.tick();
    return job;
  }

  /**
   * Enqueue multiple tasks with shared options.
   *
   * Returns all Job records.  Each job is processed independently in queue
   * order.
   */
  submitBatch(tasks: string[], options: JobOptions = {}): Job[] {
    return tasks.map((task) => this.submit(task, options));
  }

  /** Retrieve a single job record by id, or undefined if not found. */
  getJob(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  /** Retrieve all job records in submission order. */
  listJobs(): Job[] {
    return [...this.jobs.values()];
  }

  /**
   * Cancel a job.
   *
   * - If the job is `queued`, it is removed from the pending list and marked
   *   `cancelled` immediately.
   * - If the job is `running`, its AbortController is signalled; the agent
   *   loop will stop at the next inter-step checkpoint and the job will be
   *   marked `cancelled` by the worker.
   *
   * Returns `true` if the cancellation was initiated, `false` if the job
   * was not found or is already in a terminal state.
   */
  cancel(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job) return false;

    if (job.status === "queued") {
      job.status = "cancelled";
      job.finishedAt = new Date().toISOString();
      job.error = "Cancelled before processing started.";
      const idx = this.pending.indexOf(id);
      if (idx !== -1) this.pending.splice(idx, 1);
      log.info("job_cancelled_queued", { id });
      emit({ type: "queue:job_cancelled", payload: { id } });
      return true;
    }

    if (job.status === "running") {
      const ctrl = this.controllers.get(id);
      if (ctrl) {
        ctrl.abort();
        log.info("job_cancellation_signalled", { id });
        return true;
      }
    }

    return false;
  }

  /** Aggregate counts by status. */
  getStats(): QueueStats {
    let queued = 0,
      running = 0,
      done = 0,
      failed = 0,
      cancelled = 0;
    for (const job of this.jobs.values()) {
      switch (job.status) {
        case "queued":
          queued++;
          break;
        case "running":
          running++;
          break;
        case "done":
          done++;
          break;
        case "failed":
          failed++;
          break;
        case "cancelled":
          cancelled++;
          break;
      }
    }
    return { queued, running, done, failed, cancelled, total: this.jobs.size };
  }

  // ── Internal worker ────────────────────────────────────────────────────────

  /**
   * Tick the worker: start as many jobs as the concurrency limit allows.
   * Called after every submit and after every job completes.
   */
  private tick(): void {
    while (this.running.size < this.concurrency && this.pending.length > 0) {
      const id = this.pending.shift()!;
      const job = this.jobs.get(id);
      if (!job || job.status !== "queued") {
        // Job was cancelled while waiting — skip it and continue the loop.
        continue;
      }
      void this.processJob(job).then(() => this.tick());
    }
  }

  private async processJob(job: Job): Promise<void> {
    job.status = "running";
    job.startedAt = new Date().toISOString();
    this.running.add(job.id);

    const ctrl = new AbortController();
    this.controllers.set(job.id, ctrl);

    log.info("job_started", { id: job.id, mode: job.options.mode ?? "normal" });
    emit({ type: "queue:job_started", payload: { id: job.id, task: job.task } });

    const resolved = resolveAgentRunOptions(job.options);
    const agent = this.createAgent(resolved.allowWrite);

    try {
      const result = await agent.run(job.task, {
        maxSteps: resolved.maxSteps,
        maxToolFailures: resolved.maxToolFailures,
        timeoutMs: resolved.timeoutMs,
        signal: ctrl.signal,
      });

      if (ctrl.signal.aborted) {
        // Abort was triggered by cancel() while the agent was mid-run.
        job.status = "cancelled";
        job.error = "Cancelled during processing.";
        log.info("job_cancelled_during_run", { id: job.id });
        emit({ type: "queue:job_cancelled", payload: { id: job.id } });
      } else {
        job.status = "done";
        job.result = result;
        log.info("job_done", { id: job.id });
        emit({ type: "queue:job_done", payload: { id: job.id, result } });
      }
    } catch (err) {
      job.status = "failed";
      job.error = String(err);
      log.error("job_failed", { id: job.id, error: String(err) });
      emit({
        type: "queue:job_failed",
        payload: { id: job.id, error: String(err) },
      });
    } finally {
      job.finishedAt = new Date().toISOString();
      this.running.delete(job.id);
      this.controllers.delete(job.id);
    }
  }
}
