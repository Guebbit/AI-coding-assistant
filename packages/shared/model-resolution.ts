/**
 * Shared model resolution helper.
 *
 * Centralises profile-based model fallback chains so tools, processors,
 * and agent components resolve models consistently from environment vars.
 *
 * Fallback chain per profile:
 *   profile env var → `AGENT_MODEL_DEFAULT` → `OLLAMA_MODEL` → **throw**
 *
 * There is intentionally **no** hardcoded model name.  When none of the
 * environment variables are set the function throws, forcing operators to
 * configure at least `OLLAMA_MODEL` before starting Manna.
 *
 * @module shared/model-resolution
 */

/** Supported model profile names across the agent ecosystem. */
export type ModelProfile = 'fast' | 'reasoning' | 'code' | 'default';

/** Ordered list of all valid profile names. Used for validation and iteration. */
export const PROFILE_LIST: ModelProfile[] = ['fast', 'reasoning', 'code', 'default'];

/** Maps each profile to its environment-variable name. */
export const PROFILE_ENV_VARS: Record<ModelProfile, string> = {
    fast: 'AGENT_MODEL_FAST',
    reasoning: 'AGENT_MODEL_REASONING',
    code: 'AGENT_MODEL_CODE',
    default: 'AGENT_MODEL_DEFAULT'
};

/**
 * Optional overrides for model resolution.
 */
export interface IResolveModelOptions {
    /**
     * Highest-priority explicit model (e.g. a tool-specific env var).
     * When set and non-empty, it is returned immediately.
     */
    preferredModel?: string;

    /**
     * Whether to include `AGENT_MODEL_DEFAULT` in the fallback chain.
     * Default: `true`.
     */
    includeAgentDefault?: boolean;

    /**
     * Whether to include `OLLAMA_MODEL` in the fallback chain.
     * Default: `true`.
     */
    includeOllamaFallback?: boolean;
}

/**
 * Resolve a model name for a given profile with a shared, configurable
 * fallback strategy.
 *
 * Resolution order:
 *  1. `options.preferredModel` (explicit tool/caller override)
 *  2. Profile-specific env var (e.g. `AGENT_MODEL_CODE`)
 *  3. `AGENT_MODEL_DEFAULT` (unless opted out)
 *  4. `OLLAMA_MODEL` (unless opted out)
 *  5. **throw** — no hardcoded model name
 *
 * @param profile - One of `fast`, `reasoning`, `code`, or `default`.
 * @param options - Optional chain customisation and explicit preferred model.
 * @returns Resolved model identifier string.
 * @throws {Error} When no environment variable provides a model for this profile.
 */
export function resolveModel(profile: ModelProfile, options: IResolveModelOptions = {}): string {
    const preferred = options.preferredModel?.trim();
    if (preferred) {
        return preferred;
    }

    const includeAgentDefault = options.includeAgentDefault !== false;
    const includeOllamaFallback = options.includeOllamaFallback !== false;

    const profileModel = {
        fast: process.env.AGENT_MODEL_FAST,
        reasoning: process.env.AGENT_MODEL_REASONING,
        code: process.env.AGENT_MODEL_CODE,
        default: process.env.AGENT_MODEL_DEFAULT
    }[profile];

    const candidates = [
        profileModel,
        includeAgentDefault ? process.env.AGENT_MODEL_DEFAULT : undefined,
        includeOllamaFallback ? process.env.OLLAMA_MODEL : undefined
    ];

    const resolved = candidates.find((value) => typeof value === 'string' && value.trim());
    if (!resolved) {
        const envVariable = PROFILE_ENV_VARS[profile];
        throw new Error(
            `Unable to resolve model for profile "${profile}". ` +
                `Set ${envVariable}, AGENT_MODEL_DEFAULT, or OLLAMA_MODEL in your .env file.`
        );
    }
    return resolved;
}
