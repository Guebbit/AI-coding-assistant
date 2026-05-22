/**
 * Qdrant collection lifecycle management for libraries.
 *
 * Each library maps to a single Qdrant collection named `library-{libraryId}`.
 * This module handles creating, checking, and deleting collections.
 *
 * @module library/library-store
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { logger } from '../logger/logger';

/* ── Configuration ──────────────────────────────────────────────────── */

const QDRANT_URL = process.env.QDRANT_URL ?? 'http://localhost:6333';

/** Default embedding vector size (nomic-embed-text output). */
const DEFAULT_VECTOR_SIZE = 768;

/** Shared Qdrant client instance. */
const qdrant = new QdrantClient({ url: QDRANT_URL });

/* ── Helpers ─────────────────────────────────────────────────────────── */

/** Derive the Qdrant collection name from a library ID. */
export function collectionName(libraryId: string): string {
    return `library-${libraryId}`;
}

/**
 * Ensure the Qdrant collection for a library exists.
 * Creates it with cosine distance if not already present.
 *
 * @param libraryId  - The library identifier.
 * @param vectorSize - Embedding vector dimension (defaults to 768).
 */
export async function ensureCollection(
    libraryId: string,
    vectorSize: number = DEFAULT_VECTOR_SIZE
): Promise<void> {
    const name = collectionName(libraryId);
    try {
        await qdrant.createCollection(name, {
            vectors: { size: vectorSize, distance: 'Cosine' }
        });
        logger.info('library_collection_created', {
            component: 'library.store',
            collection: name
        });
    } catch {
        /* Collection already exists — safe to ignore. */
    }
}

/**
 * Upsert a single article embedding point into Qdrant.
 *
 * @param libraryId - Library identifier.
 * @param pointId   - Unique point ID (UUID string).
 * @param vector    - Embedding vector.
 * @param payload   - Metadata payload stored alongside the vector.
 */
export async function upsertPoint(
    libraryId: string,
    pointId: string,
    vector: number[],
    payload: Record<string, unknown>
): Promise<void> {
    const name = collectionName(libraryId);
    await qdrant.upsert(name, {
        wait: true,
        points: [{ id: pointId, vector, payload }]
    });
}

/**
 * Perform ANN cosine similarity search over a library's collection.
 *
 * @param libraryId - Library identifier.
 * @param vector    - Query embedding vector.
 * @param limit     - Maximum number of results to return.
 * @param filter    - Optional Qdrant filter conditions.
 * @returns Array of scored point results with payloads.
 */
export async function searchPoints(
    libraryId: string,
    vector: number[],
    limit: number,
    filter?: Record<string, unknown>
): Promise<Array<{ id: string | number; score: number; payload: Record<string, unknown> }>> {
    const name = collectionName(libraryId);
    const results = await qdrant.search(name, {
        vector,
        limit,
        filter: filter as never,
        with_payload: true
    });
    return results.map((hit) => ({
        id: hit.id,
        score: hit.score,
        payload: (hit.payload ?? {}) as Record<string, unknown>
    }));
}

/**
 * Delete the entire Qdrant collection for a library.
 *
 * @param libraryId - Library identifier.
 */
export async function deleteCollection(libraryId: string): Promise<void> {
    const name = collectionName(libraryId);
    try {
        await qdrant.deleteCollection(name);
        logger.info('library_collection_deleted', {
            component: 'library.store',
            collection: name
        });
    } catch {
        /* Collection might not exist — ignore. */
    }
}

/** Export the client for testing or advanced use. */
export { qdrant };
