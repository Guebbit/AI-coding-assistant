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
 * List of environment variables that Manna warns about if missing.
 *
 * These are not hard-required (Manna starts anyway) but their absence
 * degrades functionality.
 */
const RECOMMENDED_ENV_KEYS = ['OLLAMA_BASE_URL', 'OLLAMA_MODEL'] as const;

/**
 * Log a warning for each missing recommended environment variable.
 *
 * Does NOT throw — Manna starts regardless.
 *
 * @param logger - Logger instance.
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
