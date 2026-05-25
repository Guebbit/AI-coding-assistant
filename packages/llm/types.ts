/**
 * Ollama LLM types — interfaces for request/response communication.
 *
 * ROLE: Defines the TypeScript contracts for all Ollama API interactions.
 * Kept separate from implementation so consumers can import types without
 * pulling in runtime dependencies.
 *
 * @module llm/types
 */

/**
 * Options accepted by both `generate` and `generateWithMetadata`.
 *
 * Every field is optional — sensible defaults are applied when omitted.
 */
export interface IGenerateOptions {
    /** Ollama model name (default: `OLLAMA_MODEL` env var or `"llama3.1:8b"`). */
    model?: string;

    /** Whether to stream the response token-by-token (default: `false`). */
    stream?: boolean;

    /** Optional text suffix for fill-in-the-middle / infill completion. */
    suffix?: string;

    /** Optional system prompt that overrides the model's built-in system message. */
    system?: string;

    /**
     * Response format hint forwarded to Ollama.
     * Pass `"json"` to request JSON output, or a JSON schema object for
     * structured generation.
     */
    format?: 'json' | Record<string, unknown>;

    /** Base64-encoded images for multimodal (vision) models. */
    images?: string[];

    /**
     * Provider-specific generation options forwarded verbatim to
     * Ollama's `options` field (temperature, top_p, num_ctx, etc.).
     */
    options?: Record<string, unknown>;
}

/** Tool definition in the Ollama native tool-calling format. */
export interface IOllamaToolDefinition {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters?: Record<string, unknown>;
    };
}

/** A tool call returned by the model in a chat response. */
export interface IOllamaToolCall {
    function: {
        name: string;
        arguments?: Record<string, unknown> | string;
    };
}

/** A single message in an Ollama chat conversation. */
export interface IOllamaChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    /* eslint-disable-next-line @typescript-eslint/naming-convention -- Ollama API uses snake_case */
    tool_calls?: IOllamaToolCall[];
    name?: string;
}

/** Options for the chat endpoint. */
export interface IChatOptions {
    model?: string;
    stream?: boolean;
    tools?: IOllamaToolDefinition[];
    options?: Record<string, unknown>;
}

/** Result from the chat endpoint (single-turn, non-streaming). */
export interface IChatResult {
    message: IOllamaChatMessage;
    model: string;
    done: boolean;
    doneReason?: string;
    totalDurationNs?: number;
    loadDurationNs?: number;
    promptEvalCount?: number;
    promptEvalDurationNs?: number;
    evalCount?: number;
    evalDurationNs?: number;
}

/**
 * Rich result object returned by `generateWithMetadata`.
 *
 * Contains both the generated text and Ollama-specific telemetry
 * (timing, token counts, done reason, etc.).
 */
export interface IGenerateResult {
    /** The generated text content. */
    response: string;

    /** The model name that actually served the request. */
    model: string;

    /** Whether generation is complete (always `true` for non-streaming). */
    done: boolean;

    /** Reason generation ended (e.g. `"stop"`, `"length"`). */
    doneReason?: string;

    /** Total wall-clock duration of the request in nanoseconds. */
    totalDurationNs?: number;

    /** Time spent loading the model into memory in nanoseconds. */
    loadDurationNs?: number;

    /** Number of tokens in the evaluated prompt. */
    promptEvalCount?: number;

    /** Time spent evaluating the prompt in nanoseconds. */
    promptEvalDurationNs?: number;

    /** Number of tokens generated in the response. */
    evalCount?: number;

    /** Time spent generating the response in nanoseconds. */
    evalDurationNs?: number;
}
