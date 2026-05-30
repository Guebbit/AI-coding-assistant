/**
 * Tool-call deduplicator — prevents the agent from invoking the exact same
 * tool with the same arguments twice within a configurable cooldown window.
 *
 * ROLE: Without deduplication, a misbehaving LLM can loop endlessly on the
 * same tool call. The deduplicator hashes (toolName + args) and tracks the
 * last-seen timestamp per hash, rejecting repeated calls that fall within
 * the cooldown period (default: reject forever, i.e. cooldown = 0).
 *
 * @module tools/tool-call-deduplicator
 */

import { createHash } from 'node:crypto';

/** Per-tool cooldown overrides for the deduplicator. */
export interface IToolCallDeduplicatorOptions {
    /**
     * Cooldown in milliseconds per tool name.
     * A value of `0` (default) means "reject forever" — the same call is
     * never repeated within one agent run.
     * A positive value allows retrying after the cooldown expires.
     */
    cooldownMsByToolName?: Record<string, number>;
}

/**
 * Stateful deduplicator that tracks tool-call hashes within one agent run.
 *
 * Create one instance per run and pass it in `RunContext`.
 */
export class ToolCallDeduplicator {
    /** Maps tool name → (hash → last-seen timestamp ms). */
    private readonly seenByToolName = new Map<string, Map<string, number>>();
    /** Per-tool cooldown configuration (ms). 0 = never repeat. */
    private readonly cooldownMsByToolName: Record<string, number>;

    /**
     * @param options - Optional per-tool cooldown overrides.
     */
    constructor(options: IToolCallDeduplicatorOptions = {}) {
        this.cooldownMsByToolName = options.cooldownMsByToolName ?? {};
    }

    /**
     * Check whether this tool call is a duplicate.
     *
     * A call is a duplicate when the same (toolName + serialised args) hash
     * was seen before AND the per-tool cooldown hasn't elapsed.
     *
     * Side-effect: records the current call so future calls can be detected.
     *
     * @param toolName - The tool's name.
     * @param args     - The call's input arguments.
     * @returns `true` when the call should be rejected as a duplicate.
     */
    isDuplicate(toolName: string, args: Record<string, unknown>): boolean {
        const hash = createHash('sha256').update(JSON.stringify({ toolName, args })).digest('hex');
        const now = Date.now();
        const toolHashes = this.seenByToolName.get(toolName) ?? new Map<string, number>();
        const lastSeen = toolHashes.get(hash);
        const cooldownMs = this.cooldownMsByToolName[toolName] ?? 0;

        if (typeof lastSeen === 'number') {
            if (cooldownMs <= 0) return true;
            if (now - lastSeen < cooldownMs) return true;
        }

        toolHashes.set(hash, now);
        this.seenByToolName.set(toolName, toolHashes);
        return false;
    }
}
