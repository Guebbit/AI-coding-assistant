/**
 * Simple in-memory store for agent context.
 *
 * Capped at MAX_ENTRIES to prevent unbounded growth and keep LLM prompts short.
 * Upgrade to a vector database (e.g. Chroma, Qdrant) when semantic recall is needed.
 */

const MAX_ENTRIES = 20;

const memory: string[] = [];

/** Append a new entry, evicting the oldest if the cap is reached. */
export function addMemory(entry: string): void {
  memory.push(entry);
  if (memory.length > MAX_ENTRIES) {
    memory.shift();
  }
}

/** Return the most recent N entries (default: 10). */
export function getMemory(n = 10): string[] {
  return memory.slice(-n);
}

/** Wipe all stored entries (useful between independent sessions). */
export function clearMemory(): void {
  memory.length = 0;
}
