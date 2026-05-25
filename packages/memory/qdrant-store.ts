/**
 * Qdrant vector store — semantic memory layer.
 *
 * ROLE: Stores text embeddings in Qdrant for cross-task recall via
 * similarity search. Fail-open: when Qdrant is unreachable, disables
 * itself so the agent keeps working with the ring buffer only.
 *
 * @module memory/qdrant-store
 */

import { randomUUID } from 'node:crypto';
import { QdrantClient } from '@qdrant/js-client-rest';
import { logger } from '../logger/logger';
import { getEmbedding } from '../llm/embeddings';
import type { IMemoryEntry } from './types';

/* ── Configuration ───────────────────────────────────────────────────── */

/** URL of the Qdrant vector database REST API. */
const QDRANT_URL = process.env.QDRANT_URL ?? 'http://localhost:6333';

/** Qdrant collection name where memory vectors are stored. */
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION ?? 'agent_memory';

/* ── State ───────────────────────────────────────────────────────────── */

/** Qdrant REST client — lazy-connected on first use. */
const qdrant = new QdrantClient({ url: QDRANT_URL });

/** Flipped to `false` when Qdrant is unreachable, to avoid repeated errors. */
let qdrantEnabled = true;

/** Cached vector dimension size from the first embedding call. */
let vectorSize: number | null = null;

/** Singleton promise to prevent concurrent collection creation races. */
let ensureCollectionPromise: Promise<void> | null = null;

/* ── Internal helpers ────────────────────────────────────────────────── */

/**
 * Ensure the Qdrant collection exists, creating it if necessary.
 * Uses a singleton promise to prevent race conditions.
 */
async function ensureCollection(size: number): Promise<void> {
    if (ensureCollectionPromise) {
        return ensureCollectionPromise;
    }

    ensureCollectionPromise = (
        qdrant.getCollection(QDRANT_COLLECTION).catch(() =>
            qdrant.createCollection(QDRANT_COLLECTION, {
                vectors: { size, distance: 'Cosine' }
            })
        ) as Promise<unknown>
    ).then(() => undefined);

    await ensureCollectionPromise.finally(() => {
        ensureCollectionPromise = null;
    });
}

/* ── Public API ──────────────────────────────────────────────────────── */

/**
 * Whether Qdrant is currently enabled (becomes false on first failure).
 */
export function isQdrantEnabled(): boolean {
    return qdrantEnabled;
}

/**
 * Store a plain text entry in Qdrant as an embedding.
 *
 * @returns `true` on success, `false` if Qdrant is disabled or failed.
 */
export async function storeInQdrant(entry: string): Promise<boolean> {
    if (!qdrantEnabled) return false;

    return getEmbedding(entry)
        .then((vector) => {
            vectorSize = vector.length;
            return ensureCollection(vector.length)
                .then(() =>
                    qdrant.upsert(QDRANT_COLLECTION, {
                        wait: true,
                        points: [
                            {
                                id: randomUUID(),
                                vector,
                                payload: { text: entry, createdAt: new Date().toISOString() }
                            }
                        ]
                    })
                )
                .then(() => true);
        })
        .catch((error: unknown) => {
            qdrantEnabled = false;
            logger.warn('memory_qdrant_disabled', {
                component: 'memory',
                error: String(error),
                message: 'Falling back to in-memory only'
            });
            return false;
        });
}

/**
 * Store a structured memory entry in Qdrant with typed payload.
 *
 * @returns `true` on success, `false` if Qdrant is disabled or failed.
 */
export async function storeStructuredInQdrant(entry: IMemoryEntry): Promise<boolean> {
    if (!qdrantEnabled) return false;

    return getEmbedding(entry.content)
        .then((vector) => {
            vectorSize = vector.length;
            return ensureCollection(vector.length)
                .then(() =>
                    qdrant.upsert(QDRANT_COLLECTION, {
                        wait: true,
                        points: [
                            {
                                id: entry.id,
                                vector,
                                payload: {
                                    text: entry.content,
                                    role: entry.role,
                                    createdAt: entry.timestamp.toISOString(),
                                    ...(entry.metadata ?? {})
                                }
                            }
                        ]
                    })
                )
                .then(() => true);
        })
        .catch((error: unknown) => {
            qdrantEnabled = false;
            logger.warn('memory_qdrant_disabled', {
                component: 'memory',
                error: String(error),
                message: 'Falling back to in-memory only'
            });
            return false;
        });
}

/**
 * Search Qdrant for semantically similar entries.
 *
 * @param query - Natural-language text to search for.
 * @param limit - Max results to return.
 * @returns Array of matching text strings, or empty on failure.
 */
export async function searchQdrant(query: string, limit: number): Promise<string[]> {
    if (!qdrantEnabled) return [];

    return getEmbedding(query)
        .then((queryVector) =>
            ensureCollection(queryVector.length).then(() =>
                qdrant.search(QDRANT_COLLECTION, {
                    vector: queryVector,
                    limit,
                    with_payload: true
                })
            )
        )
        .then((results) =>
            results
                .map((point) => {
                    const payload = point.payload as { text?: unknown } | null | undefined;
                    return typeof payload?.text === 'string' ? payload.text : null;
                })
                .filter((value): value is string => value !== null)
        )
        .catch((error: unknown) => {
            logger.warn('memory_qdrant_search_failed', {
                component: 'memory',
                error: String(error)
            });
            return [];
        });
}

/**
 * Delete the entire Qdrant collection (wipe semantic memory).
 */
export async function clearQdrant(): Promise<boolean> {
    if (!qdrantEnabled) return false;

    return qdrant
        .deleteCollection(QDRANT_COLLECTION)
        .then(() => {
            vectorSize = null;
            return true;
        })
        .catch((error: unknown) => {
            logger.warn('memory_clear_failed', {
                component: 'memory',
                error: String(error)
            });
            return false;
        });
}
