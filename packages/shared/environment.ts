/**
 * Environment variable validation helpers.
 *
 * @module shared/environment
 */

/**
 * Logger abstraction used by environment validation helpers.
 */
interface IEnvironmentValidationLogger {
    /**
     * Emit a warning log.
     *
     * @param message - Log message identifier.
     * @param meta - Optional structured metadata.
     */
    warn: (message: string, meta?: object) => void;
}

/**
 * Environment variables that MUST be set for Manna to function.
 *
 * Missing any of these throws at startup rather than silently using a
 * wrong default that causes cryptic runtime failures later.
 */
const REQUIRED_ENV_KEYS = ['OLLAMA_MODEL'] as const;

/**
 * Environment variables that Manna warns about if missing.
 *
 * These are not hard-required (Manna starts anyway) but their absence
 * degrades functionality.
 */
const RECOMMENDED_ENV_KEYS = ['OLLAMA_BASE_URL'] as const;

/**
 * Throw if any required environment variable is missing or empty.
 *
 * Call this early in the startup sequence so misconfiguration is caught
 * before the server accepts requests.
 *
 * @throws {Error} When one or more required variables are not set.
 */
export const validateRequiredEnvironment = (): void => {
    const missing = REQUIRED_ENV_KEYS.filter((key) => {
        const value = process.env[key];
        return !value || value.trim() === '';
    });

    if (missing.length > 0) {
        throw new Error(
            `Missing required environment variable${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. ` +
            `Please set ${missing.length > 1 ? 'them' : 'it'} in your .env file before starting Manna.`
        );
    }
};

/**
 * Log a warning for each missing recommended environment variable.
 *
 * Does NOT throw — Manna starts regardless.
 *
 * @param logger - Logger instance.
 * @returns Nothing.
 */
export const validateRecommendedEnvironment = (logger: IEnvironmentValidationLogger): void => {
    const missing = RECOMMENDED_ENV_KEYS.filter((key) => {
        const value = process.env[key];
        return !value || value.trim() === '';
    });

    if (missing.length > 0) {
        logger.warn('missing_recommended_env_vars', { missing });
    }
};
