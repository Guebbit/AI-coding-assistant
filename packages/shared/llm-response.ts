/**
 * Shared LLM response-parsing helpers.
 *
 * Several modules (agent, model-router, decomposer, verification,
 * graph extractor) need to strip Markdown code fences from LLM
 * output before parsing the JSON payload.  Centralising this logic
 * eliminates five copy-pasted `replace(/```…/g, '').trim()` calls
 * and satisfies the DRY principle.
 *
 * @module shared/llm-response
 */

/**
 * Strip Markdown code fences that some LLMs wrap around JSON output.
 *
 * Handles both bare `` ``` `` and language-annotated `` ```json ``
 * variants.  Returns the trimmed inner text, ready for `JSON.parse`.
 *
 * @param raw - Raw LLM response string, possibly wrapped in fences.
 * @returns The cleaned string with code fences removed.
 */
export function stripCodeFences(raw: string): string {
    return raw.replace(/```(?:json)?\n?/g, '').trim();
}
