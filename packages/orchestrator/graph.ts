/**
 * LangGraph swarm graph — wires decompose, execute, review, and synthesize
 * nodes into a stateful, cyclic orchestration graph.
 *
 * ## Graph structure
 *
 * ```
 * START → decompose → execute_subtasks → review ──► synthesize → END
 *                          ▲                  │
 *                          └──── (retry) ◄────┘
 * ```
 *
 * The review node decides whether to proceed to synthesis or loop back to
 * re-execute only the failed subtasks (up to `SWARM_MAX_REVIEW_RETRIES`).
 *
 * ## Usage
 *
 * ```typescript
 * const orchestrator = new LangGraphSwarmOrchestrator(tools, processors);
 * const result = await orchestrator.run("Build a REST API with auth and tests");
 * ```
 *
 * ## Migration notes
 *
 * This module **replaces** `packages/swarm/orchestrator.ts`.
 * The legacy `SwarmOrchestrator` class is kept in place and marked
 * `@deprecated`; it will be removed in a follow-up PR once all callers
 * have been verified against the new graph-based orchestrator.
 *
 * The new `LangGraphSwarmOrchestrator` exposes the same `run()` interface
 * (`run(task, config): Promise<ISwarmResult>`) so drop-in replacement is
 * straightforward via `apps/api/agents.ts` — no API or endpoint changes
 * are required.
 *
 * @module orchestrator/graph
 */

import { StateGraph, START, END } from '@langchain/langgraph';
import { logger } from '../logger/logger';
import { saveSwarmRun } from '../persistence/db';
import type { ITool } from '../tools';
import type { IProcessor } from '../processors/types';
import type { ISwarmConfig, ISwarmResult } from '../swarm/types';
import { swarmStateAnnotation } from './state';
import {
    createDecomposeNode,
    createExecuteSubtasksNode,
    createReviewNode,
    createSynthesizeNode,
    reviewRouter
} from './nodes';

/* ── Graph builder ───────────────────────────────────────────────────── */

/**
 * Build and compile the swarm `StateGraph`.
 *
 * Creates fresh node closures capturing the supplied tools and processors,
 * wires the edges (including the cyclic review→execute_subtasks loop), and
 * compiles the graph.
 *
 * @param tools      - Tools available to every worker agent.
 * @param processors - Processors attached to every worker agent.
 * @returns A compiled LangGraph application ready to `invoke()`.
 */
export function buildSwarmGraph(tools: ITool[], processors: IProcessor[]) {
    const graph = new StateGraph(swarmStateAnnotation)
        .addNode('decompose', createDecomposeNode())
        .addNode('execute_subtasks', createExecuteSubtasksNode(tools, processors))
        .addNode('review', createReviewNode())
        .addNode('synthesize', createSynthesizeNode())
        .addEdge(START, 'decompose')
        .addEdge('decompose', 'execute_subtasks')
        .addEdge('execute_subtasks', 'review')
        .addConditionalEdges('review', reviewRouter, {
            execute_subtasks: 'execute_subtasks',
            synthesize: 'synthesize'
        })
        .addEdge('synthesize', END);

    return graph.compile();
}

/* ── LangGraphSwarmOrchestrator ──────────────────────────────────────── */

/**
 * Drop-in replacement for the legacy {@link SwarmOrchestrator}.
 *
 * Wraps the compiled LangGraph swarm state machine and exposes the same
 * `run(task, config): Promise<ISwarmResult>` interface, so API route
 * modules (`apps/api/agents.ts`) require no changes beyond swapping the
 * import.
 *
 * Differences from the legacy orchestrator:
 * - Orchestration is defined as an explicit state machine (graph), not
 *   an imperative sequence of method calls.
 * - Supports cyclic review→retry workflows out of the box.
 * - Graph topology is inspectable, serialisable, and extensible via
 *   LangGraph's node/edge API.
 * - Human-in-the-loop interrupts can be added in a future PR by wiring
 *   a LangGraph `interrupt()` call into the review node.
 *
 * @example
 * ```typescript
 * const orchestrator = new LangGraphSwarmOrchestrator(readOnlyTools, [verificationProcessor]);
 * const result = await orchestrator.run("Build a React app with auth and tests");
 * ```
 */
export class LangGraphSwarmOrchestrator {
    /**
     * Create a new `LangGraphSwarmOrchestrator`.
     *
     * @param tools      - Tools available to every worker agent.
     * @param processors - Processors attached to every worker agent.
     */
    constructor(
        private readonly tools: ITool[],
        private readonly processors: IProcessor[] = []
    ) {}

    /**
     * Run the swarm graph: decompose → execute → review → (retry?) → synthesize.
     *
     * @param task   - The user's natural-language task.
     * @param config - Optional swarm configuration overrides.
     * @returns A structured {@link ISwarmResult} with the final answer and per-subtask details.
     */
    async run(task: string, config: ISwarmConfig = {}): Promise<ISwarmResult> {
        const startTime = new Date();

        logger.info('langgraph_swarm_run_started', {
            component: 'orchestrator.graph',
            task,
            taskLength: task.length,
            maxSubtasks: config.maxSubtasks ?? 6,
            allowWrite: config.allowWrite ?? false
        });

        const app = buildSwarmGraph(this.tools, this.processors);

        const finalState = await app.invoke({
            task,
            config,
            startTime,
            subtaskResults: [],
            retryCount: 0,
            reviewPassed: false,
            answer: '',
            totalDurationMs: 0
        });

        const result: ISwarmResult = {
            answer: finalState.answer,
            subtaskResults: finalState.subtaskResults,
            totalDurationMs: finalState.totalDurationMs,
            decomposition: finalState.decomposition!
        };

        logger.info('langgraph_swarm_run_completed', {
            component: 'orchestrator.graph',
            totalDurationMs: result.totalDurationMs,
            subtaskCount: result.subtaskResults.length,
            successCount: result.subtaskResults.filter((r) => r.success).length,
            retryCount: finalState.retryCount
        });

        /* Persist to PostgreSQL (fail-open). */
        await saveSwarmRun({
            task,
            decomposition: result.decomposition,
            subtasks: result.decomposition.subtasks,
            results: result.subtaskResults,
            answer: result.answer,
            startTime,
            endTime: new Date(),
            totalDurationMs: result.totalDurationMs,
            status: 'completed'
        }).catch((error: unknown) =>
            logger.warn('langgraph_swarm_persist_failed', {
                component: 'orchestrator.graph',
                error: String(error)
            })
        );

        return result;
    }
}
