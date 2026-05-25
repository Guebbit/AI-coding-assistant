/**
 * Minimal wrapper around the Ollama local LLM API.
 *
 * ROLE: Single module for talking to Ollama. Every other package that
 * needs LLM generation imports from here so HTTP details are encapsulated.
 *
 * Architecture:
 *  - Types live in `./types.ts` (importable without runtime deps)
 *  - Config lives in `./config.ts` (env var resolution)
 *  - This file: pure implementation (generate, chat, capabilities)
 *
 * @see https://github.com/ollama/ollama/blob/main/docs/api.md
 * @module llm/ollama
 */

import { OLLAMA_BASE_URL, OLLAMA_MODEL } from './config';
import type {
    IGenerateOptions,
    IGenerateResult,
    IChatOptions,
    IChatResult,
    IOllamaChatMessage
} from './types';

// Re-export all types so existing `import { ... } from '../llm/ollama'` still works
export type {
    IGenerateOptions,
    IGenerateResult,
    IChatOptions,
    IChatResult,
    IOllamaChatMessage,
    IOllamaToolDefinition,
    IOllamaToolCall
} from './types';

/* ── generate ────────────────────────────────────────────────────────── */

/**
 * Send a prompt to Ollama and return **only** the generated text.
 *
 * Convenience wrapper around `generateWithMetadata` for callers
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

/* ── chat ────────────────────────────────────────────────────────────── */

/**
 * Multi-turn chat with optional native tool calling.
 *
 * Performs a single `POST /api/chat` call.
 *
 * @param messages - Conversation messages array.
 * @param options  - Model, tools, streaming options.
 * @returns Chat result with the assistant's message and telemetry.
 * @throws {Error} When the Ollama API returns a non-2xx status code.
 */
export async function chatWithMetadata(
    messages: IOllamaChatMessage[],
    options: IChatOptions = {}
): Promise<IChatResult> {
    const { model: modelOverride, stream = false, tools, options: providerOptions } = options;
    const model = modelOverride?.trim() || OLLAMA_MODEL;
    if (!model) {
        throw new Error(
            'No model specified and OLLAMA_MODEL environment variable is not set. ' +
                'Set OLLAMA_MODEL in your .env file (e.g. OLLAMA_MODEL=llama3.1:8b).'
        );
    }

    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model,
            stream,
            messages,
            tools,
            options: providerOptions
        })
    });

    if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(
            `Ollama API error: ${response.status} ${response.statusText}${body ? ` — ${body}` : ''}`
        );
    }

    const data = (await response.json()) as {
        message: IOllamaChatMessage;
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
        message: data.message,
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

/* ── Model capabilities ──────────────────────────────────────────────── */

const modelCapabilitiesCache = new Map<string, boolean>();

/** Clear the capabilities cache (useful in tests). */
export function clearModelCapabilitiesCache(): void {
    modelCapabilitiesCache.clear();
}

/**
 * Check if a model supports native tool calling via Ollama's /api/show.
 *
 * Results are cached per model name to avoid repeated API calls.
 *
 * @param model - Model name to check (defaults to OLLAMA_MODEL).
 * @returns `true` if the model advertises tool-calling capability.
 */
export async function modelSupportsNativeToolCalling(model?: string): Promise<boolean> {
    const effectiveModel = model?.trim() || OLLAMA_MODEL;
    if (!effectiveModel) return false;
    if (modelCapabilitiesCache.has(effectiveModel)) {
        return modelCapabilitiesCache.get(effectiveModel)!;
    }

    const response = await fetch(`${OLLAMA_BASE_URL}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: effectiveModel })
    });

    if (!response.ok) {
        modelCapabilitiesCache.set(effectiveModel, false);
        return false;
    }

    const data = (await response.json()) as {
        capabilities?: string[] | { tools?: boolean };
        details?: { capabilities?: string[] | { tools?: boolean } };
        /* eslint-disable-next-line @typescript-eslint/naming-convention -- Ollama API uses snake_case */
        model_info?: { capabilities?: string[] | { tools?: boolean } };
    };

    const sources = [data.capabilities, data.details?.capabilities, data.model_info?.capabilities];
    const supportsTools = sources.some((capability) => {
        if (!capability) return false;
        if (Array.isArray(capability)) return capability.includes('tools');
        if (typeof capability === 'object') return capability.tools === true;
        return false;
    });

    modelCapabilitiesCache.set(effectiveModel, supportsTools);
    return supportsTools;
}
