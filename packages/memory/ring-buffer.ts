/**
 * Ring buffer — ultra-low-latency in-process recent memory store.
 *
 * ROLE: Keeps the N most recent memory strings in a FIFO buffer.
 * Always available, zero network cost. Acts as fallback when Qdrant is down.
 *
 * @module memory/ring-buffer
 */

import { logger } from '../logger/logger';

/* ── Configuration ───────────────────────────────────────────────────── */

/** Maximum entries kept in the in-process ring buffer. */
const MAX_ENTRIES = 20;

/* ── State ───────────────────────────────────────────────────────────── */

/** The actual ring buffer array (FIFO). */
const recentMemory: string[] = [];

/* ── Public API ──────────────────────────────────────────────────────── */

/**
 * Append a string to the ring buffer, evicting the oldest entry
 * when the buffer exceeds `MAX_ENTRIES`.
 */
export function addToRecentMemory(entry: string): void {
    recentMemory.push(entry);
    if (recentMemory.length > MAX_ENTRIES) {
        recentMemory.shift();
    }
}

/**
 * Get the most recent N entries from the ring buffer.
 *
 * @param n - Max number to return (returns all if n > buffer size).
 */
export function getRecentMemory(n: number): string[] {
    return recentMemory.slice(-n);
}

/**
 * Clear the ring buffer entirely.
 */
export function clearRecentMemory(): void {
    recentMemory.length = 0;
}

/**
 * Current buffer size (for logging/diagnostics).
 */
export function recentMemoryCount(): number {
    return recentMemory.length;
}

/**
 * Trim a list of memory entries to fit within a character budget.
 *
 * Adopting Mastra's context-window optimisation pattern — instead of
 * blindly sending all memory to the LLM, keep only what fits in
 * `maxChars` while preferring the *most recent* entries (last items
 * in the array).
 *
 * @param entries  - Memory strings ordered oldest → newest.
 * @param maxChars - Maximum total character budget (default: 8 000).
 * @returns A subset of entries that fits within the budget.
 */
export function optimizeContextWindow(entries: string[], maxChars = 8_000): string[] {
    if (entries.length === 0) return [];

    const result: string[] = [];
    let total = 0;

    /* Walk from newest to oldest, filling the budget. */
    for (let i = entries.length - 1; i >= 0; i--) {
        const entry = entries[i];
        if (total + entry.length > maxChars) break;
        result.unshift(entry);
        total += entry.length;
    }

    logger.info('memory_context_optimized', {
        component: 'memory',
        inputCount: entries.length,
        outputCount: result.length,
        totalChars: total,
        maxChars
    });

    return result;
}
