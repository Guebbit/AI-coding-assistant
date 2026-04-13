/**
 * Structured memory entry types.
 *
 * Adopting Mastra's memory pattern — entries carry metadata alongside the raw
 * text so downstream consumers (evals, UI, context optimizers) have richer
 * information to work with.
 */

/**
 * A structured memory entry stored in both the local ring buffer and Qdrant.
 *
 * The `content` field is what was previously stored as a plain string.
 * All other fields are optional metadata that enrich the entry.
 */
export interface IMemoryEntry {
    /** Unique ID generated at insertion time (UUID v4). */
    id: string;

    /** Wall-clock time when the entry was created. */
    timestamp: Date;

    /** Who produced this memory: the user, the assistant, or a tool call. */
    role: 'user' | 'assistant' | 'tool';

    /** The raw text content — this is what the LLM will see in its prompt. */
    content: string;

    /**
     * Pre-computed embedding vector (populated after the embedding call).
     * Omitted when Qdrant / Ollama are unavailable.
     */
    embedding?: number[];

    /**
     * Arbitrary key/value metadata (task id, tool name, model, etc.).
     * Stored alongside the vector in Qdrant so you can filter / query later.
     */
    metadata?: Record<string, unknown>;
}
