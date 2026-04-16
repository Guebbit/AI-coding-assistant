/**
 * Generic async utilities shared across tools and endpoints.
 *
 * @module shared/utils
 */

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
        new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(message)), ms)
        ),
    ]);
}
