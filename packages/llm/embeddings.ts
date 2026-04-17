/**
 * Shared embedding service — single implementation of the Ollama
 * embedding API call used by memory, tool-reranker, semantic search,
 * and document ingest.
 *
 * Centralises the duplicated `getEmbedding` / `embedText` functions
 * that previously existed in four separate files with near-identical
 * logic.
 *
 * @module llm/embeddings
 */

import { OLLAMA_BASE_URL, OLLAMA_EMBED_MODEL } from './config';

/**
 * Request an embedding vector from Ollama for the given text.
 *
 * Calls the `/api/embeddings` endpoint and returns the first
 * embedding vector from the response.
 *
 * @param text  - The text to embed.
 * @param model - Override the embedding model (defaults to `OLLAMA_EMBED_MODEL`).
 * @returns A numeric embedding vector.
 * @throws {Error} When the Ollama API returns an error or an empty vector.
 */
export async function getEmbedding(text: string, model?: string): Promise<number[]> {
    const effectiveModel = model ?? OLLAMA_EMBED_MODEL;
    if (!effectiveModel) {
        throw new Error('No embedding model configured. Set OLLAMA_EMBED_MODEL in your .env file.');
    }

    const res = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: effectiveModel,
            prompt: text
        })
    });

    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(
            `Embedding API error: ${res.status} ${res.statusText}${body ? ` — ${body}` : ''}`
        );
    }

    const data = (await res.json()) as {
        embedding?: number[];
        embeddings?: number[][];
    };

    const embedding = data.embedding ?? data.embeddings?.[0];
    if (!embedding || embedding.length === 0) {
        throw new Error('Embedding API returned an empty embedding vector');
    }

    return embedding;
}
