/**
 * Verification gate processor — performs a lightweight post-tool-choice
 * LLM check to confirm the agent picked the correct tool for the task.
 *
 * Only active when `AGENT_VERIFICATION_ENABLED === 'true'`.
 *
 * When the agent returns an `action` that is not `"none"` this processor
 * fires a cheap LLM call (using `AGENT_VERIFICATION_MODEL`, defaulting to
 * `AGENT_MODEL_FAST`) asking:
 *   _"Did this tool choice correctly address the task?"_
 *
 * If the verification call returns `{ valid: false, issue: "…" }` the
 * processor appends the issue to the output thought so the agent can
 * self-correct on the next iteration, and emits a
 * `tool:verification_failed` event via the event bus.
 *
 * Environment variables:
 * - `AGENT_VERIFICATION_ENABLED` (default `"false"`) — set to `"true"` to enable.
 * - `AGENT_VERIFICATION_MODEL` (default: value of `AGENT_MODEL_FAST`) — model for the check call.
 *
 * @module processors/verification
 */

import { generate } from '../llm/ollama';
import { emit } from '../events/bus';
import { getLogger } from '../logger/logger';
import { createProcessor } from './processor-builder';

const log = getLogger('verification-processor');

/** Enabled only when explicitly opted in. */
const ENABLED = process.env.AGENT_VERIFICATION_ENABLED === 'true';

/** Model used for the verification call — defaults to the fast model. */
const VERIFICATION_MODEL =
    process.env.AGENT_VERIFICATION_MODEL ??
    process.env.AGENT_MODEL_FAST ??
    process.env.AGENT_MODEL_DEFAULT ??
    process.env.OLLAMA_MODEL ??
    'llama3';

/**
 * Verification gate `Processor`.
 *
 * Implements `processOutputStep` — called after the LLM response is
 * parsed but before the tool executes.
 *
 * Returns a modified `ProcessOutputStepArgs` when verification fails
 * (the thought is annotated with the issue), or `undefined` when the
 * tool choice is valid.
 */
export const verificationProcessor = createProcessor({
    /**
     * Check whether the chosen tool correctly addresses the task.
     *
     * @param args - Output step arguments from the agent (includes task and action).
     * @returns Modified args (with issue appended to thought) or void.
     */
    async processOutputStep(args) {
        if (!ENABLED || args.action === 'none') return;

        const verifyPrompt =
            `You are a verification assistant.\n` +
            `The agent chose the following tool for the given task.\n\n` +
            `Task: ${args.task}\n` +
            `Chosen tool: ${args.action}\n` +
            `Tool input: ${JSON.stringify(args.toolInput)}\n` +
            `Agent thought: ${args.thought}\n\n` +
            `Did this tool choice correctly address the task?\n` +
            `Reply ONLY with JSON: {"valid": true|false, "issue": "reason if invalid or null"}`;

        const verifyResult = await generate(verifyPrompt, {
            model: VERIFICATION_MODEL,
            stream: false,
            format: 'json'
        })
            .then((raw) => {
                const cleaned = raw.replace(/```(?:json)?\n?/g, '').trim();
                const parsed = JSON.parse(cleaned) as {
                    valid?: boolean;
                    issue?: string | null;
                };
                return {
                    valid: parsed.valid !== false,
                    issue: typeof parsed.issue === 'string' ? parsed.issue : null
                };
            })
            .catch((error: unknown) => {
                log.warn('verification_call_failed', { error: String(error) });
                /* Fail open — do not block the agent on a verification error. */
                return null;
            });

        if (verifyResult === null) return;
        const { valid, issue } = verifyResult;

        if (!valid && issue) {
            log.warn('verification_failed', {
                step: args.stepNumber,
                action: args.action,
                issue
            });

            emit({
                type: 'tool:verification_failed',
                payload: {
                    step: args.stepNumber,
                    tool: args.action,
                    issue
                }
            });

            /* Append the issue to the thought so the agent can self-correct. */
            return {
                ...args,
                thought: `${args.thought}\n\n[Verification failed] ${issue} — please reconsider.`
            };
        }
    }
});
