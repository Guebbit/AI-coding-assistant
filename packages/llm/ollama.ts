/**
 * Minimal wrapper around the Ollama local LLM API.
 *
 * Deliberately simple — one module, one responsibility: talk to Ollama.
 * Every other package that needs LLM generation imports from here so the
 * HTTP details are encapsulated in a single place.
 *
 * @see https://github.com/ollama/ollama/blob/main/docs/api.md
 * @module llm/ollama
 */

import { OLLAMA_BASE_URL, OLLAMA_MODEL } from './config';

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

/**
 * Send a prompt to Ollama and return **only** the generated text.
 *
 * This is a convenience wrapper around `generateWithMetadata` for callers
 * that do not need telemetry data.
 *
 * @param prompt  - The full prompt string to send to the model.
 * @param options - Optional overrides for model selection, streaming, etc.
 * @returns The raw text response from the model.
 */
export async function generate(prompt: string, options: IGenerateOptions = {}): Promise<string> {
    const result = await generateWithMetadata(prompt, options);
    return result.response;
}

/**
 * Send a prompt to Ollama and return a rich result including telemetry.
 *
 * Performs a single `POST /api/generate` call to the Ollama REST API.
 * The response body's snake_case fields are mapped to camelCase in the
 * returned `GenerateResult`.
 *
 * @param prompt  - The full prompt string to send to the model.
 * @param options - Optional overrides for model selection, streaming, etc.
 * @returns A `GenerateResult` containing the text and Ollama telemetry.
 * @throws {Error} When the Ollama API returns a non-2xx status code.
 */
export async function generateWithMetadata(
    prompt: string,
    options: IGenerateOptions = {}
): Promise<IGenerateResult> {
    const {
        model: modelOverride,
        stream = false,
        suffix,
        system,
        format,
        images,
        options: providerOptions
    } = options;

    const model = modelOverride?.trim() || OLLAMA_MODEL;
    if (!model) {
        throw new Error(
            'No model specified and OLLAMA_MODEL environment variable is not set. ' +
            'Set OLLAMA_MODEL in your .env file (e.g. OLLAMA_MODEL=llama3.1:8b).'
        );
    }

    const res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model,
            prompt,
            stream,
            suffix,
            system,
            format,
            images,
            options: providerOptions
        })
    });

    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(
            `Ollama API error: ${res.status} ${res.statusText}${body ? ` — ${body}` : ''}`
        );
    }

    /* Ollama returns snake_case keys — map them to our camelCase interface. */
    const data = (await res.json()) as {
        response: string;
        model?: string;
        done?: boolean;
        /* eslint-disable @typescript-eslint/naming-convention -- Ollama REST API uses snake_case */
        done_reason?: string;
        total_duration?: number;
        load_duration?: number;
        prompt_eval_count?: number;
        prompt_eval_duration?: number;
        eval_count?: number;
        eval_duration?: number;
        /* eslint-enable @typescript-eslint/naming-convention */
    };

    return {
        response: data.response,
        model: data.model ?? model,
        done: data.done ?? true,
        doneReason: data.done_reason,
        totalDurationNs: data.total_duration,
        loadDurationNs: data.load_duration,
        promptEvalCount: data.prompt_eval_count,
        promptEvalDurationNs: data.prompt_eval_duration,
        evalCount: data.eval_count,
        evalDurationNs: data.eval_duration
    };
}
