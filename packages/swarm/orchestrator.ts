/**
 * Swarm orchestrator — coordinates multiple agent instances to
 * collaboratively solve a complex task.
 *
 * Workflow:
 *  1. Decompose the task into subtasks via {@link decomposeTask}.
 *  2. Execute subtasks respecting dependency ordering (topological sort).
 *     Independent subtasks run sequentially (Ollama can only serve one
 *     model at a time efficiently on a single GPU, so true parallelism
 *     would cause model-swap thrashing).
 *  3. Synthesise a final answer from all subtask results.
 *
 * The orchestrator uses the existing {@link Agent} class as its worker —
 * the single-agent loop is a building block, not a replacement.
 *
 * @module swarm/orchestrator
 */

import { Agent } from "../agent/agent";
import type { ITool } from "../tools";
import type { IProcessor } from "../processors/types";
import { generate } from "../llm/ollama";
import { emit } from "../events/bus";
import { getLogger } from "../logger/logger";
import { decomposeTask } from "./decomposer";
import type {
  IDecomposition,
  ISubtask,
  ISubtaskResult,
  ISwarmConfig,
  ISwarmResult,
} from "./types";

const log = getLogger("swarm:orchestrator");

/* ── Environment ─────────────────────────────────────────────────────── */

/**
 * Model used for the final synthesis step.
 * Defaults to the reasoning model for best summarisation quality.
 */
const SYNTHESIS_MODEL =
  process.env.SWARM_SYNTHESIS_MODEL ??
  process.env.AGENT_MODEL_REASONING ??
  process.env.AGENT_MODEL_DEFAULT ??
  process.env.OLLAMA_MODEL ??
  "llama3";

/* ── SwarmOrchestrator ───────────────────────────────────────────────── */

/**
 * Orchestrates a swarm of agent workers to solve a complex task.
 *
 * Usage:
 * ```typescript
 * const orchestrator = new SwarmOrchestrator(readOnlyTools, [verificationProcessor]);
 * const result = await orchestrator.run("Build a React app with auth and tests");
 * ```
 */
export class SwarmOrchestrator {
  /**
   * Create a new SwarmOrchestrator.
   *
   * @param tools      - Tools available to every worker agent.
   * @param processors - Processors attached to every worker agent.
   */
  constructor(
    private readonly tools: ITool[],
    private readonly processors: IProcessor[] = [],
  ) {}

  /**
   * Run the swarm: decompose → execute subtasks → synthesise.
   *
   * @param task   - The user's natural-language task.
   * @param config - Optional swarm configuration overrides.
   * @returns A structured {@link ISwarmResult} with the final answer and per-subtask details.
   */
  async run(task: string, config: ISwarmConfig = {}): Promise<ISwarmResult> {
    const runStartedAt = Date.now();

    log.info("swarm_run_started", {
      task,
      taskLength: task.length,
      maxSubtasks: config.maxSubtasks ?? 6,
      allowWrite: config.allowWrite ?? false,
    });

    emit({ type: "swarm:start", payload: { task } });

    /* ── Step 1: Decompose ──────────────────────────────────────────── */
    const decomposition = await decomposeTask(task, config.maxSubtasks);

    log.info("swarm_decomposition_complete", {
      subtaskCount: decomposition.subtasks.length,
      reasoning: decomposition.reasoning,
    });

    emit({
      type: "swarm:decomposed",
      payload: {
        subtaskCount: decomposition.subtasks.length,
        reasoning: decomposition.reasoning,
        subtasks: decomposition.subtasks.map((s) => ({
          id: s.id,
          description: s.description.slice(0, 100),
          profile: s.profile,
        })),
      },
    });

    /* ── Step 2: Execute subtasks in dependency order ────────────────── */
    const subtaskResults = await this.executeSubtasks(
      decomposition,
      config,
    );

    /* ── Step 3: Synthesise final answer ────────────────────────────── */
    const answer = await this.synthesise(task, decomposition, subtaskResults);

    const totalDurationMs = Date.now() - runStartedAt;

    log.info("swarm_run_completed", {
      totalDurationMs,
      subtaskCount: subtaskResults.length,
      successCount: subtaskResults.filter((r) => r.success).length,
    });

    const result: ISwarmResult = {
      answer,
      subtaskResults,
      totalDurationMs,
      decomposition,
    };

    emit({ type: "swarm:done", payload: { answer, totalDurationMs } });

    return result;
  }

  /* ── Private: subtask execution ────────────────────────────────────── */

  /**
   * Execute all subtasks in topological order, respecting dependencies.
   *
   * Subtasks whose dependencies have all completed are executed next.
   * Within a dependency tier, subtasks run sequentially to avoid
   * Ollama model-swap thrashing on a single GPU.
   *
   * @param decomposition - The decomposition plan.
   * @param config        - Swarm configuration.
   * @returns Results for every subtask (in execution order).
   */
  private async executeSubtasks(
    decomposition: IDecomposition,
    config: ISwarmConfig,
  ): Promise<ISubtaskResult[]> {
    const results: ISubtaskResult[] = [];
    const completed = new Set<string>();
    const remaining = new Map<string, ISubtask>(
      decomposition.subtasks.map((s) => [s.id, s]),
    );

    while (remaining.size > 0) {
      /* Find subtasks whose dependencies are all satisfied. */
      const ready: ISubtask[] = [];
      for (const subtask of remaining.values()) {
        const depsReady = subtask.dependsOn.every((dep) => completed.has(dep));
        if (depsReady) {
          ready.push(subtask);
        }
      }

      if (ready.length === 0) {
        /* Circular dependency or dangling reference — execute all remaining. */
        log.warn("swarm_dependency_deadlock", {
          remaining: [...remaining.keys()],
        });
        for (const subtask of remaining.values()) {
          ready.push(subtask);
        }
      }

      /* Execute each ready subtask sequentially. */
      for (const subtask of ready) {
        const result = await this.executeOneSubtask(
          subtask,
          results,
          config,
        );
        results.push(result);
        completed.add(subtask.id);
        remaining.delete(subtask.id);
      }
    }

    return results;
  }

  /**
   * Execute a single subtask through a fresh Agent instance.
   *
   * The agent receives the subtask description enriched with context
   * from any completed dependency subtasks.
   *
   * @param subtask         - The subtask to execute.
   * @param previousResults - Results from already-completed subtasks.
   * @param config          - Swarm configuration.
   * @returns The subtask result.
   */
  private async executeOneSubtask(
    subtask: ISubtask,
    previousResults: ISubtaskResult[],
    config: ISwarmConfig,
  ): Promise<ISubtaskResult> {
    const startedAt = Date.now();
    const profile = config.profileOverride ?? subtask.profile;

    log.info("swarm_subtask_started", {
      subtaskId: subtask.id,
      profile,
      description: subtask.description.slice(0, 120),
    });

    emit({
      type: "swarm:subtask_start",
      payload: { subtaskId: subtask.id, profile },
    });

    /* Build enriched task with dependency context. */
    const enrichedTask = this.buildSubtaskPrompt(subtask, previousResults);

    /* Create a fresh agent for this subtask. */
    const agent = new Agent(this.tools);
    for (const processor of this.processors) {
      agent.addProcessor(processor);
    }

    try {
      const answer = await agent.run(enrichedTask, { profile });

      const durationMs = Date.now() - startedAt;
      log.info("swarm_subtask_completed", {
        subtaskId: subtask.id,
        durationMs,
        answerLength: answer.length,
      });

      emit({
        type: "swarm:subtask_done",
        payload: { subtaskId: subtask.id, durationMs },
      });

      return {
        subtask,
        answer,
        durationMs,
        success: true,
      };
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      const error = String(err);

      log.warn("swarm_subtask_failed", {
        subtaskId: subtask.id,
        durationMs,
        error,
      });

      emit({
        type: "swarm:subtask_error",
        payload: { subtaskId: subtask.id, error },
      });

      return {
        subtask,
        answer: "",
        durationMs,
        success: false,
        error,
      };
    }
  }

  /**
   * Build an enriched prompt for a subtask agent.
   *
   * Includes the subtask description plus context from dependency results,
   * so the agent can build on work already done.
   *
   * @param subtask         - The subtask to build a prompt for.
   * @param previousResults - All completed subtask results so far.
   * @returns The enriched task string.
   */
  private buildSubtaskPrompt(
    subtask: ISubtask,
    previousResults: ISubtaskResult[],
  ): string {
    const depResults = previousResults.filter((r) =>
      subtask.dependsOn.includes(r.subtask.id),
    );

    if (depResults.length === 0) {
      return subtask.description;
    }

    const contextLines = depResults.map(
      (r) =>
        `[${r.subtask.id}] ${r.subtask.description}:\n${r.answer}`,
    );

    return (
      `${subtask.description}\n\n` +
      `Context from previous subtasks:\n` +
      `${contextLines.join("\n\n")}`
    );
  }

  /* ── Private: synthesis ────────────────────────────────────────────── */

  /**
   * Synthesise a final answer from all subtask results.
   *
   * Uses a single LLM call to merge and summarise the individual
   * subtask outputs into a coherent response.
   *
   * @param task            - The original user task.
   * @param decomposition   - The decomposition plan.
   * @param subtaskResults  - All subtask results.
   * @returns The synthesised final answer string.
   */
  private async synthesise(
    task: string,
    decomposition: IDecomposition,
    subtaskResults: ISubtaskResult[],
  ): Promise<string> {
    /* If there was only one subtask, just return its answer directly. */
    if (subtaskResults.length === 1 && subtaskResults[0].success) {
      return subtaskResults[0].answer;
    }

    const resultSummaries = subtaskResults
      .map((r) => {
        const status = r.success ? "✅ completed" : `❌ failed: ${r.error}`;
        return `[${r.subtask.id}] ${status}\n${r.answer}`;
      })
      .join("\n\n");

    const synthesisPrompt =
      `You are a synthesis assistant.\n` +
      `The user asked: "${task}"\n\n` +
      `A team of AI agents decomposed this into subtasks and produced the following results:\n\n` +
      `${resultSummaries}\n\n` +
      `Synthesise these into a single, coherent, complete answer to the original task.\n` +
      `If any subtask failed, acknowledge the gap and provide what you can.\n` +
      `Be concise but thorough.`;

    log.info("swarm_synthesis_started", {
      subtaskCount: subtaskResults.length,
      successCount: subtaskResults.filter((r) => r.success).length,
    });

    try {
      const answer = await generate(synthesisPrompt, {
        model: SYNTHESIS_MODEL,
        stream: false,
      });
      return answer.trim();
    } catch (err) {
      log.warn("swarm_synthesis_failed", { error: String(err) });
      /* Graceful degradation — concatenate subtask answers. */
      return subtaskResults
        .filter((r) => r.success)
        .map((r) => r.answer)
        .join("\n\n---\n\n");
    }
  }
}
