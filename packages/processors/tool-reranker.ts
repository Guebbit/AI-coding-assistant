/**
 * Tool reranker processor — embeds tool descriptions once and uses
 * cosine similarity to select the top-N most relevant tools per step.
 *
 * Only active when `TOOL_RERANKER_ENABLED === 'true'`.
 *
 * On the first invocation the processor embeds all tool descriptions via
 * the Ollama embedding API and caches the results in a module-level `Map`.
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

import { getLogger } from '../logger/logger';
import { createProcessor } from './processor-builder';
import { envInt } from '../shared';

const log = getLogger('tool-reranker-processor');

/** Enabled only when explicitly opted in. */
const ENABLED = process.env.TOOL_RERANKER_ENABLED === 'true';

/** Maximum number of tools passed to the agent per step. */
const TOP_N = envInt(process.env.TOOL_RERANKER_TOP_N, 10);

/** Ollama base URL for the embedding endpoint. */
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';

/** Embedding model used for vectorising tool descriptions and tasks. */
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text';

/** Module-level cache: tool name → embedding vector. */
const embeddingCache = new Map<string, number[]>();

/** Whether the cache has been populated for the current tool set. */
let cacheInitialised = false;

/* ── Helpers ─────────────────────────────────────────────────────────── */

/**
 * Request an embedding vector from Ollama for the given text.
 *
 * @param text - The text to embed.
 * @returns A numeric embedding vector.
 * @throws {Error} When the API call fails or returns an empty vector.
 */
async function getEmbedding(text: string): Promise<number[]> {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: OLLAMA_EMBED_MODEL, prompt: text })
    });
    if (!res.ok) {
        throw new Error(`Ollama embedding API error: ${res.status} ${res.statusText}`);
    }
    const json = (await res.json()) as { embedding?: number[] };
    if (!json.embedding?.length) {
        throw new Error('Ollama returned an empty embedding vector');
    }
    return json.embedding;
}

/**
 * Compute the cosine similarity between two equal-length vectors.
 *
 * @param a - First vector.
 * @param b - Second vector.
 * @returns Cosine similarity in the range [−1, 1].
 */
function cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
}

/* ── Tool descriptions registry ──────────────────────────────────────── */

/**
 * Mapping from tool name to its human-readable description.
 * Populated by the factory function and used for embedding initialisation.
 */
const toolDescriptions = new Map<string, string>();

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
    if (toolDescriptionMap) {
        for (const [name, desc] of toolDescriptionMap) {
            toolDescriptions.set(name, desc);
        }
    }

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

            try {
                /* Initialise the embedding cache on first call. */
                if (!cacheInitialised) {
                    await Promise.all(
                        args.tools.map(async (name) => {
                            if (!embeddingCache.has(name)) {
                                const desc = toolDescriptions.get(name) ?? name;
                                const vector = await getEmbedding(desc);
                                embeddingCache.set(name, vector);
                            }
                        })
                    );
                    cacheInitialised = true;
                    log.info('tool_reranker_cache_built', { toolCount: args.tools.length });
                }

                /* Embed the current task. */
                const taskVector = await getEmbedding(args.task);

                /* Score each tool. */
                const scored = args.tools
                    .filter((name) => embeddingCache.has(name))
                    .map((name) => ({
                        name,
                        score: cosineSimilarity(taskVector, embeddingCache.get(name)!)
                    }))
                    .sort((a, b) => b.score - a.score);

                const topTools = scored.slice(0, TOP_N).map((t) => t.name);

                log.info('tool_reranker_filtered', {
                    step: args.stepNumber,
                    original: args.tools.length,
                    retained: topTools.length
                });

                return { ...args, tools: topTools };
            } catch (error) {
                /* Fail open — return the original tool list if reranking errors. */
                log.warn('tool_reranker_failed', { error: String(error) });
                return;
            }
        }
    });
}
