/**
 * Generic utilities shared across tools and endpoints.
 *
 * @module shared/utils
 */

import { safeReadFile } from './safe-read-file';

/**
 * Parse an environment variable as a number.
 *
 * Uses `parseFloat` so it handles both integers and decimals.
 * Callers that need a true integer should pass an integer fallback and
 * document in the `.env.example` that the value must be a whole number.
 *
 * Returns `fallback` when the value is `undefined`, empty, or not a number.
 *
 * @param value    - Raw environment variable value (may be `undefined`).
 * @param fallback - Default to use when parsing fails.
 */
export function envNumber(value: string | undefined, fallback: number): number {
    const parsed = parseFloat(value ?? String(fallback));
    return Number.isNaN(parsed) ? fallback : parsed;
}

/**
 * Parse an environment variable as a boolean.
 *
 * Returns `true` only when the trimmed, lowercased value is `"true"` or `"1"`.
 * Returns `fallback` (default `false`) for any other value or when undefined.
 *
 * @param value    - Raw environment variable value (may be `undefined`).
 * @param fallback - Default boolean when the env var is absent or unrecognised.
 */
export function envBoolean(value: string | undefined, fallback = false): boolean {
    if (value === undefined || value.trim() === '') return fallback;
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1';
}

/**
 * Race a promise against a timeout.
 *
 * @param promise  - The promise to race.
 * @param ms       - Timeout in milliseconds.
 * @param message  - Optional timeout error message.
 * @returns The resolved value of `promise`.
 * @throws {Error} When the timeout fires before the promise resolves.
 */
export function withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    message = `Operation timed out after ${ms}ms`
): Promise<T> {
    return Promise.race([
        promise,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), ms))
    ]);
}

/**
 * Resolve input data from either a file path or inline base64 string.
 *
 * Consolidates the repeated "path OR base64 data" pattern used by
 * pdf.read, image.classify, and speech.to.text tools.
 *
 * @param pathParam - Optional file path (relative to workspace root).
 * @param dataParam - Optional base64-encoded data string.
 * @returns The resolved data as a Buffer.
 * @throws {Error} When neither `path` nor `data` is provided.
 */
export async function resolveDataSource(
    pathParameter: string | undefined,
    dataParameter: string | undefined
): Promise<Buffer> {
    if (typeof dataParameter === 'string' && dataParameter.trim() !== '') {
        return Buffer.from(dataParameter, 'base64');
    }
    if (typeof pathParameter === 'string' && pathParameter.trim() !== '') {
        return safeReadFile(pathParameter);
    }
    throw new Error('Either "path" (file on disk) or "data" (base64 string) must be provided');
}

/**
 * Build Ollama generation options from env vars using a common prefix.
 *
 * Eliminates the repeated `{ temperature, top_p, top_k, num_ctx, repeat_penalty }`
 * pattern found across tool implementations.
 *
 * @param prefix   - Environment variable prefix (e.g. `"TOOL_VISION"`).
 * @param defaults - Default values for each option.
 * @returns An options object ready for the Ollama API.
 */
/* eslint-disable @typescript-eslint/naming-convention -- Ollama API uses snake_case parameter names */
export function buildOllamaOptions(
    prefix: string,
    defaults: {
        temperature: number;
        top_p: number;
        top_k: number;
        num_ctx: number;
        repeat_penalty: number;
    }
): Record<string, unknown> {
    return {
        temperature: envNumber(process.env[`${prefix}_TEMPERATURE`], defaults.temperature),
        top_p: envNumber(process.env[`${prefix}_TOP_P`], defaults.top_p),
        top_k: envNumber(process.env[`${prefix}_TOP_K`], defaults.top_k),
        num_ctx: envNumber(process.env[`${prefix}_NUM_CTX`], defaults.num_ctx),
        repeat_penalty: envNumber(process.env[`${prefix}_REPEAT_PENALTY`], defaults.repeat_penalty)
    };
}
/* eslint-enable @typescript-eslint/naming-convention */
