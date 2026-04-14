/**
 * LangGraph orchestrator node factories.
 *
 * Each function returns a node handler suitable for `StateGraph.addNode()`.
 * Nodes are pure functions of the graph state — they receive the current
 * state and return a partial state update.  Side-effects (LLM calls, event
 * bus emissions, DB persistence) happen inside the node, not outside it.
 *
 * Node flow:
 * ```
 * decompose → execute_subtasks → review ──► synthesize → END
 *                  ▲                  │
 *                  └── (retry loop) ◄─┘
 * ```
 *
 * Tools and processors are captured via closure; they are never stored in
 * the shared graph state.
 *
 * @module orchestrator/nodes
 */

import { Agent } from '../agent/agent';
import type { ITool } from '../tools';
import type { IProcessor } from '../processors/types';
import { generate } from '../llm/ollama';
import { emit } from '../events/bus';
import { getLogger } from '../logger/logger';
import { decomposeTask } from '../swarm/decomposer';
import type { ISubtask, ISubtaskResult } from '../swarm/types';
import type { ISwarmGraphState } from './state';

const log = getLogger('orchestrator:nodes');

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
    'llama3';

/**
 * Maximum number of review→retry cycles before forcing a synthesize.
 * Can be overridden via the `SWARM_MAX_REVIEW_RETRIES` environment variable.
 */
const MAX_REVIEW_RETRIES = Number.parseInt(process.env.SWARM_MAX_REVIEW_RETRIES ?? '1', 10);

/* ── decompose node ──────────────────────────────────────────────────── */

/**
 * Create the **decompose** node handler.
 *
 * Calls `decomposeTask()` to break the user task into a structured
 * `IDecomposition` plan, then emits the corresponding swarm events.
 *
 * @returns A LangGraph node function for the decompose step.
 */
export function createDecomposeNode() {
    return async (state: ISwarmGraphState): Promise<Partial<ISwarmGraphState>> => {
        log.info('graph_node_decompose', {
            task: state.task,
            maxSubtasks: state.config.maxSubtasks ?? 6
        });

        emit({ type: 'swarm:start', payload: { task: state.task } });

        const decomposition = await decomposeTask(state.task, state.config.maxSubtasks);

        log.info('graph_decomposition_complete', {
            subtaskCount: decomposition.subtasks.length,
            reasoning: decomposition.reasoning
        });

        emit({
            type: 'swarm:decomposed',
            payload: {
                subtaskCount: decomposition.subtasks.length,
                reasoning: decomposition.reasoning,
                subtasks: decomposition.subtasks.map((s) => ({
                    id: s.id,
                    description: s.description.slice(0, 100),
                    profile: s.profile
                }))
            }
        });

        return { decomposition };
    };
}

/* ── execute_subtasks node ───────────────────────────────────────────── */

/**
 * Create the **execute_subtasks** node handler.
 *
 * Runs each subtask (or only failed ones on retry) through a fresh `Agent`
 * instance in topological dependency order, sequentially to avoid GPU
 * model-swap thrashing.
 *
 * On the first execution all subtasks run; on a retry cycle, only subtasks
 * that previously failed (or have no prior result) are re-executed.
 *
 * @param tools      - Tools available to every worker agent.
 * @param processors - Processors attached to every worker agent.
 * @returns A LangGraph node function for the execute_subtasks step.
 */
export function createExecuteSubtasksNode(tools: ITool[], processors: IProcessor[]) {
    return async (state: ISwarmGraphState): Promise<Partial<ISwarmGraphState>> => {
        const { decomposition, config, subtaskResults: existingResults, retryCount } = state;

        if (!decomposition) {
            log.warn('graph_execute_no_decomposition');
            return { subtaskResults: [] };
        }

        /* On retry: keep successful results, re-run only failed subtasks. */
        const successfulIds = new Set(
            existingResults.filter((r) => r.success).map((r) => r.subtask.id)
        );

        const subtasksToRun =
            retryCount > 0
                ? decomposition.subtasks.filter((s) => !successfulIds.has(s.id))
                : decomposition.subtasks;

        log.info('graph_execute_subtasks_started', {
            total: decomposition.subtasks.length,
            toRun: subtasksToRun.length,
            retryCount
        });

        /* Start from the already-successful results. */
        const results: ISubtaskResult[] = existingResults.filter((r) => r.success);

        /* Execute in topological dependency order. */
        const completed = new Set<string>(results.map((r) => r.subtask.id));
        const remaining = new Map<string, ISubtask>(subtasksToRun.map((s) => [s.id, s]));

        while (remaining.size > 0) {
            const ready: ISubtask[] = [];

            for (const subtask of remaining.values()) {
                const depsReady = subtask.dependsOn.every((dep) => completed.has(dep));
                if (depsReady) {
                    ready.push(subtask);
                }
            }

            if (ready.length === 0) {
                /* Circular dependency or dangling reference — break deadlock. */
                log.warn('graph_execute_dependency_deadlock', {
                    remaining: [...remaining.keys()]
                });
                for (const subtask of remaining.values()) {
                    ready.push(subtask);
                }
            }

            for (const subtask of ready) {
                const result = await executeOneSubtask(subtask, results, config, tools, processors);
                results.push(result);
                completed.add(subtask.id);
                remaining.delete(subtask.id);
            }
        }

        return { subtaskResults: results };
    };
}

/* ── review node ─────────────────────────────────────────────────────── */

/**
 * Create the **review** node handler.
 *
 * Evaluates the current subtask results and decides whether the graph
 * should proceed to synthesis or retry execution.
 *
 * Decision logic:
 * 1. If all subtasks succeeded → `reviewPassed = true`.
 * 2. If some subtasks failed AND `retryCount < MAX_REVIEW_RETRIES` → `reviewPassed = false`
 *    (triggers a retry cycle).
 * 3. If retries are exhausted → `reviewPassed = true` (force synthesis with partial results).
 *
 * TODO: Human-in-the-loop approval can be wired here in a future PR by
 * replacing or augmenting this heuristic with an interruption checkpoint.
 *
 * @returns A LangGraph node function for the review step.
 */
export function createReviewNode() {
    return async (state: ISwarmGraphState): Promise<Partial<ISwarmGraphState>> => {
        const { subtaskResults, retryCount } = state;

        const failedCount = subtaskResults.filter((r) => !r.success).length;
        const totalCount = subtaskResults.length;

        log.info('graph_review', {
            total: totalCount,
            failed: failedCount,
            retryCount,
            maxRetries: MAX_REVIEW_RETRIES
        });

        if (failedCount === 0) {
            /* All subtasks passed — no retry needed. */
            log.info('graph_review_passed', { total: totalCount });
            return { reviewPassed: true };
        }

        if (retryCount < MAX_REVIEW_RETRIES) {
            /* Failures detected and retries remain — trigger retry. */
            log.info('graph_review_retry_triggered', {
                failedCount,
                retriesRemaining: MAX_REVIEW_RETRIES - retryCount
            });
            return {
                reviewPassed: false,
                retryCount: retryCount + 1
            };
        }

        /* Retries exhausted — accept partial results and continue to synthesis. */
        log.warn('graph_review_retries_exhausted', {
            failedCount,
            totalCount,
            retryCount
        });
        return { reviewPassed: true };
    };
}

/* ── synthesize node ─────────────────────────────────────────────────── */

/**
 * Create the **synthesize** node handler.
 *
 * Merges all subtask results into a single coherent final answer using
 * a single LLM call.  If only one subtask succeeded, returns its answer
 * directly without an extra LLM call.
 *
 * @returns A LangGraph node function for the synthesize step.
 */
export function createSynthesizeNode() {
    return async (state: ISwarmGraphState): Promise<Partial<ISwarmGraphState>> => {
        const { task, subtaskResults, startTime } = state;
        const totalDurationMs = Date.now() - startTime.getTime();

        const answer = await synthesise(task, subtaskResults);

        log.info('graph_synthesize_complete', {
            subtaskCount: subtaskResults.length,
            totalDurationMs
        });

        emit({ type: 'swarm:done', payload: { answer, totalDurationMs } });

        return { answer, totalDurationMs };
    };
}

/* ── Routing function ────────────────────────────────────────────────── */

/**
 * Conditional edge router for the review node.
 *
 * Returns `"execute_subtasks"` to trigger a retry, or `"synthesize"` to
 * proceed to final answer generation.
 *
 * @param state - Current graph state after the review node has run.
 * @returns The name of the next node to execute.
 */
export function reviewRouter(state: ISwarmGraphState): 'execute_subtasks' | 'synthesize' {
    return state.reviewPassed ? 'synthesize' : 'execute_subtasks';
}

/* ── Internal helpers ────────────────────────────────────────────────── */

/**
 * Execute a single subtask through a fresh Agent instance.
 *
 * The agent receives the subtask description enriched with context
 * from any completed dependency subtasks.
 *
 * @param subtask         - The subtask to execute.
 * @param previousResults - Results from already-completed subtasks.
 * @param config          - Swarm configuration.
 * @param tools           - Tools available to the worker agent.
 * @param processors      - Processors attached to the worker agent.
 * @returns The subtask result.
 */
async function executeOneSubtask(
    subtask: ISubtask,
    previousResults: ISubtaskResult[],
    config: ISwarmGraphState['config'],
    tools: ITool[],
    processors: IProcessor[]
): Promise<ISubtaskResult> {
    const startedAt = Date.now();
    const profile = config.profileOverride ?? subtask.profile;

    log.info('graph_subtask_started', {
        subtaskId: subtask.id,
        profile,
        description: subtask.description.slice(0, 120)
    });

    emit({
        type: 'swarm:subtask_start',
        payload: { subtaskId: subtask.id, profile }
    });

    const enrichedTask = buildSubtaskPrompt(subtask, previousResults);

    const agent = new Agent(tools);
    for (const processor of processors) {
        agent.addProcessor(processor);
    }

    return agent
        .run(enrichedTask, { profile })
        .then((answer) => {
            const durationMs = Date.now() - startedAt;
            log.info('graph_subtask_completed', {
                subtaskId: subtask.id,
                durationMs,
                answerLength: answer.length
            });
            emit({
                type: 'swarm:subtask_done',
                payload: { subtaskId: subtask.id, durationMs }
            });
            return { subtask, answer, durationMs, success: true as const };
        })
        .catch((error: unknown) => {
            const durationMs = Date.now() - startedAt;
            const errorMessage = String(error);
            log.warn('graph_subtask_failed', {
                subtaskId: subtask.id,
                durationMs,
                error: errorMessage
            });
            emit({
                type: 'swarm:subtask_error',
                payload: { subtaskId: subtask.id, error: errorMessage }
            });
            return {
                subtask,
                answer: '',
                durationMs,
                success: false as const,
                error: errorMessage
            };
        });
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
function buildSubtaskPrompt(subtask: ISubtask, previousResults: ISubtaskResult[]): string {
    const depResults = previousResults.filter((r) => subtask.dependsOn.includes(r.subtask.id));

    if (depResults.length === 0) {
        return subtask.description;
    }

    const contextLines = depResults.map(
        (r) => `[${r.subtask.id}] ${r.subtask.description}:\n${r.answer}`
    );

    return (
        `${subtask.description}\n\n` +
        `Context from previous subtasks:\n` +
        `${contextLines.join('\n\n')}`
    );
}

/**
 * Synthesise a final answer from all subtask results.
 *
 * Uses a single LLM call to merge and summarise individual subtask
 * outputs into a coherent response.  If only one subtask succeeded,
 * returns its answer directly to avoid a redundant LLM call.
 *
 * @param task           - The original user task.
 * @param subtaskResults - All subtask results (successful and failed).
 * @returns The synthesised final answer string.
 */
async function synthesise(task: string, subtaskResults: ISubtaskResult[]): Promise<string> {
    const successfulResults = subtaskResults.filter((r) => r.success);

    if (successfulResults.length === 1 && subtaskResults.length === 1) {
        return successfulResults[0].answer;
    }

    const resultSummaries = subtaskResults
        .map((r) => {
            const status = r.success ? '✅ completed' : `❌ failed: ${r.error}`;
            return `[${r.subtask.id}] ${status}\n${r.answer}`;
        })
        .join('\n\n');

    const synthesisPrompt =
        `You are a synthesis assistant.\n` +
        `The user asked: "${task}"\n\n` +
        `A team of AI agents decomposed this into subtasks and produced the following results:\n\n` +
        `${resultSummaries}\n\n` +
        `Synthesise these into a single, coherent, complete answer to the original task.\n` +
        `If any subtask failed, acknowledge the gap and provide what you can.\n` +
        `Be concise but thorough.`;

    log.info('graph_synthesis_started', {
        subtaskCount: subtaskResults.length,
        successCount: successfulResults.length
    });

    return generate(synthesisPrompt, { model: SYNTHESIS_MODEL, stream: false })
        .then((answer) => answer.trim())
        .catch((error: unknown) => {
            log.warn('graph_synthesis_failed', { error: String(error) });
            /* Graceful degradation — concatenate subtask answers. */
            return successfulResults.map((r) => r.answer).join('\n\n---\n\n');
        });
}
