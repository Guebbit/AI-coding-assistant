/**
 * Centralised Ollama configuration constants.
 *
 * Several packages (llm, memory, processors, tools, graph) previously
 * duplicated the same `process.env.OLLAMA_BASE_URL ?? '…'` pattern.
 * This module provides a single source of truth for the Ollama
 * connection parameters so that changes propagate everywhere.
 *
 * @module llm/config
 */

/** Base URL for the Ollama REST API, configurable via environment variable. */
export const OLLAMA_BASE_URL: string = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';

/** Ollama model used to generate text embeddings. */
export const OLLAMA_EMBED_MODEL: string = process.env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text';

/**
 * Default generative model, used as a fallback for all profiles.
 * `undefined` when `OLLAMA_MODEL` is not set — callers must handle this
 * and throw a clear error rather than silently using a wrong model.
 */
export const OLLAMA_MODEL: string | undefined = process.env.OLLAMA_MODEL?.trim() || undefined;
