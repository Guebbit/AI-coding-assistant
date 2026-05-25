/**
 * Execute-subtasks node — runs each subtask through a fresh Agent instance.
 *
 * ROLE: Heart of the swarm. Iterates subtasks in dependency order,
 * spawning an Agent per subtask. On retry, only re-runs failed ones.
 *
 * @module orchestrator/execute-node
 */

import { Agent } from '../agent/agent';
import type { ITool } from '../tools';
import type { IProcessor } from '../processors/types';
import { emit } from '../events/bus';
import { logger } from '../logger/logger';
import type { ISubtask, ISubtaskResult } from '../swarm/types';
import type { ISwarmGraphState } from './state';

/**
 * Create the **execute_subtasks** node handler.
 *
 * Runs each subtask (or only failed ones on retry) through a fresh `Agent`
 * instance in topological dependency order, sequentially to avoid GPU
 * model-swap thrashing.
 *
 * @param tools      - Tools available to every worker agent.
 * @param processors - Processors attached to every worker agent.
 * @returns A LangGraph node function for the execute_subtasks step.
 */
export function createExecuteSubtasksNode(tools: ITool[], processors: IProcessor[]) {
    return async (state: ISwarmGraphState): Promise<Partial<ISwarmGraphState>> => {
        const { decomposition, config, subtaskResults: existingResults, retryCount } = state;

        if (!decomposition) {
            logger.warn('graph_execute_no_decomposition', { component: 'orchestrator.nodes' });
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

        logger.info('graph_execute_subtasks_started', {
            component: 'orchestrator.nodes',
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
                logger.warn('graph_execute_dependency_deadlock', {
                    component: 'orchestrator.nodes',
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

/* ── Internal helpers ────────────────────────────────────────────────── */

/**
 * Execute a single subtask through a fresh Agent instance.
 *
 * The agent receives the subtask description enriched with context
 * from any completed dependency subtasks.
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

    logger.info('graph_subtask_started', {
        component: 'orchestrator.nodes',
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
        .then((runResult) => {
            const durationMs = Date.now() - startedAt;
            logger.info('graph_subtask_completed', {
                component: 'orchestrator.nodes',
                subtaskId: subtask.id,
                durationMs,
                answerLength: runResult.answer.length
            });
            emit({
                type: 'swarm:subtask_done',
                payload: { subtaskId: subtask.id, durationMs }
            });
            return {
                subtask,
                answer: runResult.answer,
                durationMs,
                success: true as const,
                meta: runResult.meta
            };
        })
        .catch((error: unknown) => {
            const durationMs = Date.now() - startedAt;
            const errorMessage = String(error);
            logger.warn('graph_subtask_failed', {
                component: 'orchestrator.nodes',
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
 * Includes context from already-completed dependency results.
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
