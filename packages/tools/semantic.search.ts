/**
 * Semantic search tool — rank text documents/files by relevance to a query.
 *
 * Embeds both the query and each document via Ollama's embedding
 * endpoint, then ranks by cosine similarity.  Returns the top-K
 * most relevant documents with their scores and text snippets.
 *
 * Uses the shared `resolveSafePath` helper for file-based inputs.
 *
 * @module tools/semantic.search
 */

import fs from 'fs/promises';
import type { ITool } from './types';
import { resolveSafePath, cosineSimilarity } from '../shared';
import { getEmbedding } from '../llm/embeddings';
import { OLLAMA_EMBED_MODEL } from '../llm/config';

/** Hard cap on the number of documents that can be searched at once. */
const MAX_DOCUMENTS = 50;

/** Maximum characters read from any single document. */
const MAX_DOC_CHARS = 12_000;

/** Internal type for a ranked search result. */
interface IRankedDocument {
    /** Identifies the source: `"document:N"` or `"file:path"`. */
    source: string;
    /** Cosine similarity score (−1 to 1, higher = more relevant). */
    score: number;
    /** First 500 characters of the document for preview. */
    snippet: string;
}

/**
 * Tool instance for semantic search over inline text and/or files.
 *
 * Input:
 * ```json
 * {
 *   "query":     "what is dependency injection?",
 *   "documents": ["text snippet 1", "text snippet 2"],
 *   "paths":     ["src/di.ts", "src/container.ts"],
 *   "topK":      3
 * }
 * ```
 */
export const semanticSearchTool: ITool = {
    name: 'semantic_search',
    description:
        'Semantic search over provided text snippets and/or files. ' +
        'Input: { query: string, documents?: string[], paths?: string[], topK?: number }',

    /**
     * Embed the query and each document, rank by cosine similarity, return top-K.
     *
     * @param input           - Tool input object.
     * @param input.query     - Natural-language search query.
     * @param input.documents - Optional array of inline text strings to search.
     * @param input.paths     - Optional array of file paths to read and search.
     * @param input.topK      - Number of top results to return (default: 5).
     * @returns Ranked search results with source, score, and snippet.
     * @throws {Error} When no documents are provided or limits are exceeded.
     */
    async execute({ query, documents, paths, topK }) {
        if (typeof query !== 'string' || query.trim() === '') {
            throw new Error('"query" must be a non-empty string');
        }

        /* Collect documents from inline strings and/or file paths. */
        const docs: Array<{ source: string; text: string }> = [];

        if (Array.isArray(documents)) {
            for (const [index, value] of documents.entries()) {
                if (typeof value !== 'string' || value.trim() === '') {
                    continue;
                }
                docs.push({
                    source: `document:${index + 1}`,
                    text: value.slice(0, MAX_DOC_CHARS)
                });
            }
        }

        if (Array.isArray(paths)) {
            for (const filePath of paths) {
                if (typeof filePath !== 'string' || filePath.trim() === '') {
                    continue;
                }
                const safePath = resolveSafePath(filePath);
                const content = await fs.readFile(safePath, 'utf-8');
                docs.push({
                    source: `file:${filePath}`,
                    text: content.slice(0, MAX_DOC_CHARS)
                });
            }
        }

        if (docs.length === 0) {
            throw new Error('Provide at least one item in "documents" or "paths"');
        }

        if (docs.length > MAX_DOCUMENTS) {
            throw new Error(`Too many documents. Maximum supported: ${MAX_DOCUMENTS}`);
        }

        /* Embed the query and each document, then rank by similarity. */
        const queryEmbedding = await getEmbedding(query);

        const ranked: IRankedDocument[] = [];
        for (const document of docs) {
            const embedding = await getEmbedding(document.text);
            ranked.push({
                source: document.source,
                score: cosineSimilarity(queryEmbedding, embedding),
                snippet: document.text.slice(0, 500)
            });
        }

        const k =
            typeof topK === 'number' && topK > 0
                ? Math.min(Math.floor(topK), ranked.length)
                : Math.min(5, ranked.length);
        ranked.sort((a, b) => b.score - a.score);
        return {
            model: OLLAMA_EMBED_MODEL,
            query,
            totalDocuments: ranked.length,
            results: ranked.slice(0, k)
        };
    }
};
