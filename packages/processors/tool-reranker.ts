/**
 * Tool reranker processor — embeds tool descriptions once and uses
 * cosine similarity to select the top-N most relevant tools per step.
 *
 * Only active when `TOOL_RERANKER_ENABLED === 'true'`.
 *
 * On the first invocation the processor embeds all tool descriptions via
 * the Ollama embedding API and caches the results in a processor-local `Map`.
 * At each subsequent step it embeds the current task, computes cosine
 * similarity against every cached tool embedding, and returns the `args`
 * with the `tools` list filtered to the top-N names.
 *
 * Environment variables:
 * - `TOOL_RERANKER_ENABLED` (default `"false"`) — set to `"true"` to enable.
 * - `TOOL_RERANKER_TOP_N` (default `"10"`) — maximum number of tools to pass
 *   to the agent per step.
 *
 * @module processors/tool-reranker
 */

import { logger } from '../logger/logger';
import { createProcessor } from './processor-builder';
import { envNumber } from '../shared';
import { OllamaToolRerankerBackend, ToolReranker } from '../tools/tool-reranker';

/** Enabled only when explicitly opted in. */
const ENABLED = process.env.TOOL_RERANKER_ENABLED === 'true';

/** Maximum number of tools passed to the agent per step. */
const TOP_N = envNumber(process.env.TOOL_RERANKER_TOP_N, 10);

/* ── Processor ───────────────────────────────────────────────────────── */

/**
 * Create the tool reranker `Processor`.
 *
 * Accepts a `toolDescriptionMap` so the caller can supply the full set
 * of tool names and descriptions for embedding.  When not supplied,
 * the processor embeds tool names alone (lower quality but functional).
 *
 * @param toolDescriptionMap - Optional map from tool name to description.
 * @returns A `Processor` that implements `processInputStep`.
 */
export function createToolRerankerProcessor(
    toolDescriptionMap?: Map<string, string>
): ReturnType<typeof createProcessor> {
    const toolDescriptions = new Map(toolDescriptionMap ?? []);
    const reranker = new ToolReranker(new OllamaToolRerankerBackend());

    return createProcessor({
        /**
         * Filter the tool list to the top-N most relevant tools for the task.
         *
         * @param args - Input step arguments.
         * @returns Modified args with the filtered tool list, or void on error.
         */
        async processInputStep(args) {
            if (!ENABLED) return;
            if (args.tools.length <= TOP_N) return;
            const toolDefs = args.tools.map((name) => ({
                name,
                description: toolDescriptions.get(name) ?? name
            }));
            const prompt = `${args.task}\n${args.context}\n${args.memory.join('\n')}`.trim();

            return reranker
                .rerank(prompt, toolDefs, TOP_N)
                .then((rankedTools) => {
                    const topTools = rankedTools.map((tool) => tool.name);
                    logger.info('tool_reranker_filtered', {
                        component: 'processors.tool_reranker',
                        step: args.stepNumber,
                        original: args.tools.length,
                        retained: topTools.length
                    });
                    return { ...args, tools: topTools };
                })
                .catch((error: unknown) => {
                    /* Fail open — return the original tool list if reranking errors. */
                    logger.warn('tool_reranker_failed', {
                        component: 'processors.tool_reranker',
                        error: String(error)
                    });
                    return undefined;
                });
        }
    });
}
