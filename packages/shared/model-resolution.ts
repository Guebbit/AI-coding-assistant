/**
 * Shared model resolution helper.
 *
 * Centralises profile-based model fallback chains so tools, processors,
 * and agent components resolve models consistently from environment vars.
 *
 * @module shared/model-resolution
 */

/** Supported model profile names across the agent ecosystem. */
export type ModelProfile = 'fast' | 'reasoning' | 'code' | 'default';

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

    /**
     * Final hardcoded fallback when no env var is available.
     * Default: `"llama3.1:8b"`.
     */
    hardDefault?: string;
}

/**
 * Resolve a model name for a given profile with a shared, configurable
 * fallback strategy.
 *
 * @param profile - One of `fast`, `reasoning`, `code`, or `default`.
 * @param options - Optional chain customisation and explicit preferred model.
 * @returns Resolved model identifier string.
 */
export function resolveModel(profile: ModelProfile, options: IResolveModelOptions = {}): string {
    const preferred = options.preferredModel?.trim();
    if (preferred) {
        return preferred;
    }

    const includeAgentDefault = options.includeAgentDefault !== false;
    const includeOllamaFallback = options.includeOllamaFallback !== false;
    const hardDefault = options.hardDefault?.trim() || 'llama3.1:8b';

    const defaultChain = [
        includeAgentDefault ? process.env.AGENT_MODEL_DEFAULT : undefined,
        includeOllamaFallback ? process.env.OLLAMA_MODEL : undefined,
        hardDefault
    ];

    const profileModel = {
        fast: process.env.AGENT_MODEL_FAST,
        reasoning: process.env.AGENT_MODEL_REASONING,
        code: process.env.AGENT_MODEL_CODE,
        default: process.env.AGENT_MODEL_DEFAULT
    }[profile];

    const resolved = [profileModel, ...defaultChain].find(
        (value) => typeof value === 'string' && value.trim()
    );
    if (!resolved) {
        throw new Error(`Unable to resolve model for profile "${profile}"`);
    }
    return resolved;
}
