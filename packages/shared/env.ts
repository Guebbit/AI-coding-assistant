/**
 * Shared environment-variable parsing helpers.
 *
 * These tiny utilities are used across tools and the model router to
 * read numeric configuration from `process.env` with safe fallback
 * defaults.  Centralising them here eliminates the duplicate
 * `envFloat` / `envInt` definitions that previously lived in every
 * tool file and in `model-router.ts`.
 *
 * @module shared/env
 */

/**
 * Parse an environment variable as a floating-point number.
 *
 * If the variable is `undefined` or cannot be parsed as a valid
 * number the provided `fallback` value is returned instead.
 *
 * @param value    - The raw environment variable value (may be `undefined`).
 * @param fallback - Default number to use when parsing fails.
 * @returns The parsed float or the fallback.
 */
export function envFloat(value: string | undefined, fallback: number): number {
    const parsed = parseFloat(value ?? String(fallback));
    return Number.isNaN(parsed) ? fallback : parsed;
}

/**
 * Parse an environment variable as an integer (base-10).
 *
 * If the variable is `undefined` or cannot be parsed as a valid
 * integer the provided `fallback` value is returned instead.
 *
 * @param value    - The raw environment variable value (may be `undefined`).
 * @param fallback - Default integer to use when parsing fails.
 * @returns The parsed integer or the fallback.
 */
export function envInt(value: string | undefined, fallback: number): number {
    const parsed = parseInt(value ?? String(fallback), 10);
    return Number.isNaN(parsed) ? fallback : parsed;
}
