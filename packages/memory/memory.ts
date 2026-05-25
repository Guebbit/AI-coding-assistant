/**
 * Hybrid short-term + semantic memory module.
 *
 * ROLE: Public API composing two storage layers:
 *  1. `ring-buffer.ts` — ultra-fast local FIFO (always available)
 *  2. `qdrant-store.ts` — vector-based semantic recall (fail-open)
 *
 * When Qdrant is unavailable the system silently falls back to the
 * ring buffer so the agent keeps working without errors.
 *
 * @module memory/memory
 */

import { randomUUID } from 'node:crypto';
import { logger } from '../logger/logger';
import type { IMemoryEntry } from './types';
import {
    addToRecentMemory,
    getRecentMemory,
    clearRecentMemory,
    recentMemoryCount
} from './ring-buffer';
import {
    isQdrantEnabled,
    storeInQdrant,
    storeStructuredInQdrant,
    searchQdrant,
    clearQdrant
} from './qdrant-store';

// Re-export for consumers who import from memory/memory
export { optimizeContextWindow } from './ring-buffer';

/* ── Configuration ───────────────────────────────────────────────────── */

/** Default cap on the number of memory strings returned by `getMemory`. */
const DEFAULT_RETURN_COUNT = 10;

/* ── Public API ──────────────────────────────────────────────────────── */

/**
 * Append a plain-text entry to both the local ring buffer and Qdrant.
 *
 * When Qdrant is unavailable the entry is stored in the ring buffer
 * only. Qdrant is permanently disabled for this process once the
 * first error is encountered (to avoid repeated slow failures).
 *
 * @param entry - The text to persist as a memory entry.
 */
export async function addMemory(entry: string): Promise<void> {
    const startedAt = Date.now();
    addToRecentMemory(entry);

    if (!isQdrantEnabled()) {
        logger.info('memory_added_local_only', {
            component: 'memory',
            recentCount: recentMemoryCount(),
            durationMs: Date.now() - startedAt
        });
        return;
    }

    const stored = await storeInQdrant(entry);
    logger.info(stored ? 'memory_added' : 'memory_added_local_only', {
        component: 'memory',
        recentCount: recentMemoryCount(),
        durationMs: Date.now() - startedAt
    });
}

/**
 * Retrieve a combined list of recent + semantically relevant memories.
 *
 * When Qdrant is available the results are a de-duplicated merge of
 * the most recent ring-buffer entries and the top semantic matches.
 * When Qdrant is unavailable only the ring buffer entries are returned.
 *
 * @param query - Natural-language query used for semantic retrieval (optional).
 * @param n     - Maximum number of memory strings to return (default: 10).
 * @returns An array of memory strings (oldest → newest).
 */
export async function getMemory(query = '', n = DEFAULT_RETURN_COUNT): Promise<string[]> {
    const startedAt = Date.now();
    const cappedN = Math.max(1, n);
    const recent = getRecentMemory(cappedN);

    // No query or Qdrant disabled → return ring buffer only
    if (!isQdrantEnabled() || query.trim() === '') {
        logger.info('memory_read_recent_only', {
            component: 'memory',
            queryLength: query.length,
            returnedCount: recent.length,
            qdrantEnabled: isQdrantEnabled(),
            durationMs: Date.now() - startedAt
        });
        return recent;
    }

    // Semantic search + merge with recent
    const semantic = await searchQdrant(query, cappedN);

    /* Merge recent + semantic, de-duplicating by exact text match. */
    const merged: string[] = [...recent];
    const seen = new Set(merged);
    for (const item of semantic) {
        if (!seen.has(item)) {
            merged.push(item);
            seen.add(item);
        }
    }
    const output = merged.slice(0, cappedN);

    logger.info('memory_read_hybrid', {
        component: 'memory',
        queryLength: query.length,
        recentCount: recent.length,
        semanticCount: semantic.length,
        returnedCount: output.length,
        durationMs: Date.now() - startedAt
    });
    return output;
}

/**
 * Wipe all memory — both the local ring buffer and the Qdrant collection.
 *
 * If Qdrant is unavailable only the ring buffer is cleared.
 */
export async function clearMemory(): Promise<void> {
    const startedAt = Date.now();
    clearRecentMemory();

    if (!isQdrantEnabled()) {
        logger.info('memory_cleared_recent_only', {
            component: 'memory',
            durationMs: Date.now() - startedAt
        });
        return;
    }

    const cleared = await clearQdrant();
    logger.info(cleared ? 'memory_cleared' : 'memory_cleared_recent_only', {
        component: 'memory',
        durationMs: Date.now() - startedAt
    });
}

/**
 * Add a structured `MemoryEntry` to memory.
 *
 * Follows Mastra's pattern of storing typed entries with role and
 * metadata. The `content` field is used as the text stored in Qdrant;
 * all fields are persisted as Qdrant payload for future filtering.
 *
 * @param entry - Structured memory entry (role, content, metadata, etc.)
 *                without `id` and `timestamp` which are auto-generated.
 */
export async function addStructuredMemory(
    entry: Omit<IMemoryEntry, 'id' | 'timestamp'>
): Promise<void> {
    const startedAt = Date.now();
    const id = randomUUID();
    const timestamp = new Date();
    const fullEntry: IMemoryEntry = { id, timestamp, ...entry };

    addToRecentMemory(fullEntry.content);

    if (!isQdrantEnabled()) {
        logger.info('memory_added_local_only', {
            component: 'memory',
            recentCount: recentMemoryCount(),
            durationMs: Date.now() - startedAt
        });
        return;
    }

    const stored = await storeStructuredInQdrant(fullEntry);
    logger.info(stored ? 'memory_structured_added' : 'memory_added_local_only', {
        component: 'memory',
        id,
        role: fullEntry.role,
        recentCount: recentMemoryCount(),
        durationMs: Date.now() - startedAt
    });
}
