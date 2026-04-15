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

/**
 * Validate that `task` is a non-empty string.
 *
 * Returns the trimmed task string on success, or an error message
 * string on failure.  Callers can distinguish the two cases by
 * checking `result.valid`.
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
