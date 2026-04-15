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
import { envInt, cosineSimilarity } from '../shared';
import { getEmbedding } from '../llm/embeddings';

/** Enabled only when explicitly opted in. */
const ENABLED = process.env.TOOL_RERANKER_ENABLED === 'true';

/** Maximum number of tools passed to the agent per step. */
const TOP_N = envInt(process.env.TOOL_RERANKER_TOP_N, 10);

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
    const embeddingCache = new Map<string, number[]>();
    const toolDescriptions = new Map(toolDescriptionMap ?? []);
    let cachedToolSetSignature: string | null = null;

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

            const initCache = async (): Promise<void> => {
                const signature = [...args.tools].sort().join('\u0000');
                if (signature === cachedToolSetSignature) return;

                embeddingCache.clear();
                await Promise.all(
                    args.tools.map(async (name) => {
                        const desc = toolDescriptions.get(name) ?? name;
                        const vector = await getEmbedding(desc);
                        embeddingCache.set(name, vector);
                    })
                );

                cachedToolSetSignature = signature;
                logger.info('tool_reranker_cache_built', {
                    component: 'processors.tool_reranker',
                    toolCount: args.tools.length
                });
            };

            return initCache()
                .then(() => getEmbedding(args.task))
                .then((taskVector) => {
                    const scored = args.tools
                        .filter((name) => embeddingCache.has(name))
                        .map((name) => ({
                            name,
                            score: cosineSimilarity(taskVector, embeddingCache.get(name)!)
                        }))
                        .sort((a, b) => b.score - a.score);
                    const topTools = scored.slice(0, TOP_N).map((t) => t.name);
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
