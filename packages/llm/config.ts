/**
 * Centralised Ollama configuration constants.
 *
 * Several packages (llm, memory, processors, tools, graph) previously
 * duplicated the same `process.env.OLLAMA_BASE_URL ?? '…'` pattern.
 * This module provides a single source of truth for the Ollama
 * connection parameters so that changes propagate everywhere.
 *
 * Model names are **never** hardcoded — when the corresponding
 * environment variable is missing the value is `undefined` and callers
 * must handle this explicitly (typically by throwing a clear error at
 * the point of use).
 *
 * @module llm/config
 */

/** Base URL for the Ollama REST API, configurable via environment variable. */
export const OLLAMA_BASE_URL: string = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';

/**
 * Ollama model used to generate text embeddings.
 * `undefined` when `OLLAMA_EMBED_MODEL` is not set — callers must
 * provide a clear error when attempting to use embeddings without
 * configuring this variable.
 */
export const OLLAMA_EMBED_MODEL: string | undefined =
    process.env.OLLAMA_EMBED_MODEL?.trim() || undefined;

/**
 * Default generative model, used as a fallback for all profiles.
 * `undefined` when `OLLAMA_MODEL` is not set — callers must handle this
 * and throw a clear error rather than silently using a wrong model.
 */
export const OLLAMA_MODEL: string | undefined = process.env.OLLAMA_MODEL?.trim() || undefined;
