/**
 * Centralised memory/vector-store configuration constants.
 *
 * Qdrant URL and collection name were previously duplicated across
 * `memory/qdrant-store.ts` and `tools/document.ingest.ts`.  This
 * module provides a single source of truth.
 *
 * @module memory/config
 */

/** URL of the Qdrant vector database REST API. */
export const QDRANT_URL: string = process.env.QDRANT_URL ?? 'http://localhost:6333';

/** Qdrant collection name where memory vectors are stored. */
export const QDRANT_COLLECTION: string = process.env.QDRANT_COLLECTION ?? 'agent_memory';
