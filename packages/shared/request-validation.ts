/**
 * Shared HTTP request validation helpers.
 *
 * The `POST /run`, `POST /run/stream`, `POST /run/swarm`, and
 * `POST /workflow` endpoints all duplicate the same task and profile
 * validation logic.  This module centralises those checks so that
 * validation rules are defined once and any change propagates to
 * every consumer.
 *
 * @module shared/request-validation
 */

import { t } from './i18n';

/** Request-level tool-policy strategy mode. */
export type ToolPolicyMode = 'guidance' | 'authorization' | 'hybrid';

/**
 * Minimal typed scaffold for request-level tool policy controls.
 *
 * This structure is intentionally transport-level only for now:
 * it validates input shape and preserves intent for future processors.
 */
export interface IToolPolicy {
    /** How the runtime should interpret this policy (`guidance` by default). */
    mode?: ToolPolicyMode;
    /** Candidate tools the caller prefers to allow or focus on. */
    allowlist?: string[];
    /** Tools the caller wants to avoid or block for this request. */
    denylist?: string[];
    /** Soft-priority tools used as ranking hints, not hard gates. */
    preferred?: string[];
}

/**
 * Validate that `task` is a non-empty string.
 *
 * Returns the trimmed task string on success, or an error message
 * string on failure.  Callers distinguish the two cases via
 * `'error' in result`.
 *
 * @param task - The raw task value from the request body.
 * @returns An object with either the validated `task` or an `error`.
 */
export function validateTask(task: unknown): { task: string } | { error: string } {
    if (!task || typeof task !== 'string' || task.trim() === '') {
        return { error: t('error.task_required') };
    }
    return { task: task.trim() };
}

/**
 * Validate that `profile`, when provided, is a member of the
 * allowed profiles set.
 *
 * @param profile       - The raw profile value from the request body.
 * @param validProfiles - Set of valid profile strings.
 * @returns An error message string if invalid, or `null` if valid/absent.
 */
export function validateProfile(
    profile: unknown,
    validProfiles: ReadonlySet<string>
): string | null {
    if (profile !== undefined && !validProfiles.has(profile as string)) {
        return t('error.invalid_profile', {
            profiles: [...validProfiles].join(', ')
        });
    }
    return null;
}

/** Valid values for {@link IToolPolicy.mode}. */
const VALID_TOOL_POLICY_MODES: ReadonlySet<ToolPolicyMode> = new Set([
    'guidance',
    'authorization',
    'hybrid'
]);

/**
 * Parse and normalize a string-array policy field.
 *
 * @param value - Raw field input.
 * @param fieldName - Field name for error messages.
 * @returns Normalized unique strings, `undefined` if absent, or an error.
 */
function normalizePolicyStringList(
    value: unknown,
    fieldName: keyof Pick<IToolPolicy, 'allowlist' | 'denylist' | 'preferred'>
): { value?: string[]; error?: string } {
    if (value === undefined) {
        return {};
    }

    if (!Array.isArray(value)) {
        return { error: `"toolPolicy.${fieldName}" must be an array of non-empty strings` };
    }

    const normalized = value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);

    if (normalized.length !== value.length) {
        return { error: `"toolPolicy.${fieldName}" must contain only non-empty strings` };
    }

    return { value: [...new Set(normalized)] };
}

/**
 * Validate optional request-level tool policy controls.
 *
 * This intentionally validates shape only and does not yet enforce tool
 * selection behavior. Enforcements remain owned by capability gating.
 *
 * @param toolPolicy - Raw `toolPolicy` payload from the request body.
 * @returns A normalized policy or an error string.
 */
export function validateToolPolicy(toolPolicy: unknown): {
    toolPolicy?: IToolPolicy;
    error?: string;
} {
    if (toolPolicy === undefined) {
        return {};
    }

    if (!toolPolicy || typeof toolPolicy !== 'object' || Array.isArray(toolPolicy)) {
        return { error: '"toolPolicy" must be an object when provided' };
    }

    const raw = toolPolicy as Record<string, unknown>;
    const mode = raw.mode;

    if (mode !== undefined && !VALID_TOOL_POLICY_MODES.has(mode as ToolPolicyMode)) {
        return {
            error: `"toolPolicy.mode" must be one of: ${[...VALID_TOOL_POLICY_MODES].join(', ')}`
        };
    }

    const allowlist = normalizePolicyStringList(raw.allowlist, 'allowlist');
    if (allowlist.error) return { error: allowlist.error };
    const denylist = normalizePolicyStringList(raw.denylist, 'denylist');
    if (denylist.error) return { error: denylist.error };
    const preferred = normalizePolicyStringList(raw.preferred, 'preferred');
    if (preferred.error) return { error: preferred.error };

    return {
        toolPolicy: {
            ...(mode ? { mode: mode as ToolPolicyMode } : {}),
            ...(allowlist.value ? { allowlist: allowlist.value } : {}),
            ...(denylist.value ? { denylist: denylist.value } : {}),
            ...(preferred.value ? { preferred: preferred.value } : {})
        }
    };
}

/**
 * Validated request fields for agent-run endpoints.
 *
 * Returned by `validateRunRequest` on success so callers avoid
 * repeating the same 3-step validation dance.
 */
export interface IValidatedRunRequest {
    task: string;
    toolPolicy?: IToolPolicy;
}

/**
 * Validate the common fields shared by `POST /run`, `POST /run/stream`,
 * and `POST /run/swarm` endpoints in a single pass.
 *
 * Returns either a validated request object or an error string.
 *
 * @param body          - Raw request body (destructured by the caller).
 * @param validProfiles - Set of allowed profile strings.
 * @returns Validated request or error string.
 */
export function validateRunRequest(
    body: { task?: unknown; profile?: unknown; toolPolicy?: unknown },
    validProfiles: ReadonlySet<string>
): { valid: IValidatedRunRequest } | { error: string } {
    const taskResult = validateTask(body.task);
    if ('error' in taskResult) return { error: taskResult.error };

    const profileError = validateProfile(body.profile, validProfiles);
    if (profileError) return { error: profileError };

    const toolPolicyResult = validateToolPolicy(body.toolPolicy);
    if (toolPolicyResult.error) return { error: toolPolicyResult.error };

    return {
        valid: {
            task: taskResult.task,
            toolPolicy: toolPolicyResult.toolPolicy
        }
    };
}
