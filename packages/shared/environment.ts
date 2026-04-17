/**
 * Environment variables that MUST be set for Manna to function.
 *
 * Missing any of these throws at startup rather than silently using a
 * wrong default that causes cryptic runtime failures later.
 *
 * `OLLAMA_MODEL` is required because it serves as the last-resort
 * fallback in the model resolution chain (profile var → OLLAMA_MODEL → throw).
 * Without it, requests fail with confusing "Unable to resolve model" errors
 * instead of a clear startup message.
 */
const REQUIRED_ENV_KEYS = [
    'OLLAMA_MODEL',
    'OLLAMA_BASE_URL',
    'OLLAMA_EMBED_MODEL',
    'AGENT_MODEL_FAST',
    'AGENT_MODEL_REASONING',
    'AGENT_MODEL_CODE'
];

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
