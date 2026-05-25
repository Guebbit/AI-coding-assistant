/**
 * Synthesize node — merges subtask results into a single coherent answer.
 *
 * ROLE: Final step. Takes all subtask outputs and produces one
 * unified answer via LLM summarisation (or direct pass-through if trivial).
 *
 * @module orchestrator/synthesize-node
 */

import { generate } from '../llm/ollama';
import { emit } from '../events/bus';
import { logger } from '../logger/logger';
import { resolveModel } from '../shared';
import type { ISubtaskResult } from '../swarm/types';
import type { ISwarmGraphState } from './state';

/* ── Configuration ───────────────────────────────────────────────────── */

/**
 * Model used for the final synthesis step.
 * Defaults to the reasoning model for best summarisation quality.
 */
const SYNTHESIS_MODEL = resolveModel('reasoning', {
    preferredModel: process.env.SWARM_SYNTHESIS_MODEL
});

/**
 * Create the **synthesize** node handler.
 *
 * Merges all subtask results into a single coherent final answer using
 * a single LLM call. If only one subtask succeeded, returns its answer
 * directly without an extra LLM call.
 *
 * @returns A LangGraph node function for the synthesize step.
 */
export function createSynthesizeNode() {
    return async (state: ISwarmGraphState): Promise<Partial<ISwarmGraphState>> => {
        const { task, subtaskResults, startTime } = state;
        const totalDurationMs = Date.now() - startTime.getTime();

        const answer = await synthesise(task, subtaskResults);

        logger.info('graph_synthesize_complete', {
            component: 'orchestrator.nodes',
            subtaskCount: subtaskResults.length,
            totalDurationMs
        });

        emit({ type: 'swarm:done', payload: { answer, totalDurationMs } });

        return { answer, totalDurationMs };
    };
}

/* ── Internal helper ─────────────────────────────────────────────────── */

/**
 * Synthesise a final answer from all subtask results.
 *
 * Uses a single LLM call to merge and summarise individual subtask
 * outputs into a coherent response. If only one subtask succeeded,
 * returns its answer directly to avoid a redundant LLM call.
 */
async function synthesise(task: string, subtaskResults: ISubtaskResult[]): Promise<string> {
    const successfulResults = subtaskResults.filter((r) => r.success);

    // Single subtask → no need for synthesis LLM call
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

    logger.info('graph_synthesis_started', {
        component: 'orchestrator.nodes',
        subtaskCount: subtaskResults.length,
        successCount: successfulResults.length
    });

    return generate(synthesisPrompt, { model: SYNTHESIS_MODEL, stream: false })
        .then((answer) => answer.trim())
        .catch((error: unknown) => {
            logger.warn('graph_synthesis_failed', {
                component: 'orchestrator.nodes',
                error: String(error)
            });
            /* Graceful degradation — concatenate subtask answers. */
            return successfulResults.map((r) => r.answer).join('\n\n---\n\n');
        });
}
