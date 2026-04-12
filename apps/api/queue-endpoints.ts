import { z } from "zod";
import type { Express } from "express";
import { getLogger } from "../../packages/logger/logger";
import type { JobQueue } from "../../packages/queue/queue";

const log = getLogger("queue-api");

// ── Validation schemas ─────────────────────────────────────────────────────

const jobOptionsSchema = z.object({
  allowWrite: z.boolean().optional().default(false),
  maxSteps: z.number().int().positive().max(200).optional(),
  maxToolFailures: z.number().int().nonnegative().max(50).optional(),
  timeoutMs: z.number().int().positive().optional(),
  mode: z.enum(["normal", "all_night"]).optional().default("normal"),
});

const submitSchema = jobOptionsSchema.extend({
  task: z.string().min(1, "task must be a non-empty string"),
});

const batchSubmitSchema = jobOptionsSchema.extend({
  tasks: z
    .array(z.string().min(1))
    .min(1, "tasks must contain at least one item")
    .max(50, "maximum 50 tasks per batch"),
});

// ── Route registration ─────────────────────────────────────────────────────

/**
 * Register all job-queue REST endpoints on the given Express app.
 *
 * Endpoints:
 *   POST   /queue/submit         — enqueue a single task
 *   POST   /queue/submit/batch   — enqueue multiple tasks with shared options
 *   GET    /queue/jobs           — list all jobs + aggregate stats
 *   GET    /queue/jobs/:id       — get a single job's full record
 *   DELETE /queue/jobs/:id       — cancel a queued or running job
 *   GET    /queue/stats          — aggregate counts only
 */
export function registerQueueRoutes(app: Express, queue: JobQueue): void {
  // ── POST /queue/submit ─────────────────────────────────────────────────
  /**
   * Submit a single task to the job queue.
   *
   * Body:
   *   {
   *     "task":            "describe what you want the agent to do",
   *     "allowWrite":      false,            // optional; default false
   *     "maxSteps":        20,               // optional; overrides AGENTS_MAX_STEPS
   *     "maxToolFailures": 3,                // optional; default unlimited
   *     "timeoutMs":       3600000,          // optional; default no timeout
   *     "mode":            "normal"          // optional; "normal" | "all_night"
   *   }
   *
   * Response 202:
   *   { "jobId": "...", "status": "queued", "createdAt": "..." }
   */
  app.post("/queue/submit", (req, res) => {
    const parsed = submitSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.format() });
      return;
    }
    const { task, ...options } = parsed.data;
    const job = queue.submit(task, options);
    log.info("queue_submit", { jobId: job.id, mode: options.mode });
    res.status(202).json({
      jobId: job.id,
      status: job.status,
      createdAt: job.createdAt,
    });
  });

  // ── POST /queue/submit/batch ───────────────────────────────────────────
  /**
   * Submit multiple tasks with shared options.
   *
   * Body:
   *   {
   *     "tasks": ["task 1", "task 2", ...],  // 1–50 tasks
   *     "mode":  "all_night",                // shared options, all optional
   *     ...
   *   }
   *
   * Response 202:
   *   { "jobs": [{ "jobId": "...", "status": "queued", "createdAt": "..." }, ...] }
   */
  app.post("/queue/submit/batch", (req, res) => {
    const parsed = batchSubmitSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.format() });
      return;
    }
    const { tasks, ...options } = parsed.data;
    const jobs = queue.submitBatch(tasks, options);
    log.info("queue_batch_submit", { count: jobs.length, mode: options.mode });
    res.status(202).json({
      jobs: jobs.map((j) => ({
        jobId: j.id,
        status: j.status,
        createdAt: j.createdAt,
      })),
    });
  });

  // ── GET /queue/jobs ────────────────────────────────────────────────────
  /**
   * List all jobs with their current status plus aggregate stats.
   *
   * Result fields are truncated for readability in list view.
   * For the full record (including the complete result), use GET /queue/jobs/:id.
   */
  app.get("/queue/jobs", (_req, res) => {
    const jobs = queue.listJobs().map((j) => ({
      id: j.id,
      taskPreview: j.task.slice(0, 120),
      mode: j.options.mode ?? "normal",
      status: j.status,
      createdAt: j.createdAt,
      startedAt: j.startedAt,
      finishedAt: j.finishedAt,
      ...(j.status === "done" ? { result: j.result } : {}),
      ...(j.status === "failed" || j.status === "cancelled"
        ? { error: j.error }
        : {}),
    }));
    res.json({ jobs, stats: queue.getStats() });
  });

  // ── GET /queue/jobs/:id ────────────────────────────────────────────────
  /**
   * Retrieve the full record for a single job, including the complete result.
   *
   * Response 200: full Job object
   * Response 404: { "error": "Job not found" }
   */
  app.get("/queue/jobs/:id", (req, res) => {
    const job = queue.getJob(req.params.id);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    res.json(job);
  });

  // ── DELETE /queue/jobs/:id ─────────────────────────────────────────────
  /**
   * Cancel a queued or running job.
   *
   * - Queued job: removed from the pending list immediately.
   * - Running job: abort signal sent; stops at the next inter-step checkpoint.
   *
   * Response 200: { "cancelled": true }
   * Response 404: job not found
   * Response 409: job already in a terminal state (done / failed / cancelled)
   */
  app.delete("/queue/jobs/:id", (req, res) => {
    const job = queue.getJob(req.params.id);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    const initiated = queue.cancel(req.params.id);
    if (!initiated) {
      res.status(409).json({
        error: `Job cannot be cancelled in its current state: ${job.status}`,
      });
      return;
    }
    res.json({ cancelled: true });
  });

  // ── GET /queue/stats ───────────────────────────────────────────────────
  /**
   * Aggregate job counts by status.
   *
   * Response 200:
   *   { "queued": 2, "running": 1, "done": 5, "failed": 0, "cancelled": 1, "total": 9 }
   */
  app.get("/queue/stats", (_req, res) => {
    res.json(queue.getStats());
  });
}
