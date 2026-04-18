/**
 * Generic utilities shared across tools and endpoints.
 *
 * @module shared/utils
 */

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
