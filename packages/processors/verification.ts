/**
 * Verification gate processor — validates tool results before the agent continues.
 *
 * This processor hooks into `processInputStep`.  At the start of each step it
 * inspects the accumulated context for the most recently executed tool result
 * and asks a fast LLM whether the result looks correct for the intended action.
 *
 * If verification fails the processor:
 *  1. Appends the issue description to the context so the agent can self-correct.
 *  2. Emits a `tool:verification_failed` event for observability.
 *
 * The processor is **opt-in** — it is a complete no-op unless the environment
 * variable `AGENT_VERIFICATION_ENABLED` is set to `"true"`.
 *
 * Configuration:
 * - `AGENT_VERIFICATION_ENABLED`  — `"true"` / `"false"` (default `"false"`).
 * - `AGENT_VERIFICATION_MODEL`    — Ollama model to use for verification calls
 *                                   (default: same as `AGENT_MODEL_FAST`).
 *
 * @module processors/verification
 */

import { generate } from "../llm/ollama";
import { emit } from "../events/bus";
import { createProcessor } from "./processor-builder";
import { getLogger } from "../logger/logger";
import type { ProcessInputStepArgs } from "./types";

const log = getLogger("verification");

/* ── Configuration ───────────────────────────────────────────────────── */

/**
 * Whether the verification gate is active.
 * Enabled only when `AGENT_VERIFICATION_ENABLED=true`.
 */
const VERIFICATION_ENABLED =
  (process.env.AGENT_VERIFICATION_ENABLED ?? "false").toLowerCase() === "true";

/**
 * The Ollama model used for verification calls.
 * Defaults to `AGENT_MODEL_FAST` (which itself falls back to `OLLAMA_MODEL`).
 */
const VERIFICATION_MODEL =
  process.env.AGENT_VERIFICATION_MODEL ??
  process.env.AGENT_MODEL_FAST ??
  process.env.OLLAMA_MODEL ??
  "llama3";

/* ── Internal helpers ────────────────────────────────────────────────── */

/**
 * Regular expression that matches the last tool result appended to context.
 *
 * Matches entries of the form:
 * ```
 * Step N — "tool_name" returned: {...}
 * ```
 * Captures the tool name (group 1) and the serialised result (group 2).
 */
const TOOL_RESULT_PATTERN =
  /Step \d+ — "([^"]+)" returned: ([\s\S]+?)(?=\nStep \d+ —|\n?$)/;

/**
 * Shape of the JSON object the verification LLM is asked to return.
 */
interface VerificationResponse {
  /** Whether the tool result appears correct for the intended action. */
  valid: boolean;
  /** A brief description of any detected issue (present only when `valid` is `false`). */
  issue?: string;
}

/**
 * Extract the most recent tool result from the accumulated context string.
 *
 * Scans for the last occurrence of a "Step N — "tool" returned: ..." entry.
 *
 * @param context - The accumulated context string from the agent loop.
 * @returns An object with `toolName` and `resultText`, or `null` if no result found.
 */
function extractLastToolResult(
  context: string,
): { toolName: string; resultText: string } | null {
  /* Find all matches and take the last one. */
  const allMatches = [...context.matchAll(new RegExp(TOOL_RESULT_PATTERN.source, "g"))];
  if (allMatches.length === 0) {
    return null;
  }
  const last = allMatches[allMatches.length - 1];
  return {
    toolName: last[1],
    resultText: last[2].trim(),
  };
}

/**
 * Ask the verification LLM whether a tool result looks correct.
 *
 * Sends a minimal prompt to the fast model and parses its JSON response.
 * On any parse or network failure, this function returns `{ valid: true }`
 * so that verification errors are silently skipped rather than blocking the agent.
 *
 * @param toolName   - The name of the tool that produced the result.
 * @param resultText - The serialised tool result (may be truncated).
 * @returns A `VerificationResponse` indicating validity and optional issue description.
 */
async function callVerificationLlm(
  toolName: string,
  resultText: string,
): Promise<VerificationResponse> {
  const prompt =
    `You are a verification assistant.\n` +
    `A tool named "${toolName}" just executed and returned the following result:\n\n` +
    `${resultText.slice(0, 2000)}\n\n` +
    `Does this result look like a correct, meaningful response for the tool "${toolName}"?\n` +
    `Answer ONLY with a single valid JSON object:\n` +
    `{ "valid": true } if the result is correct.\n` +
    `{ "valid": false, "issue": "short description of the problem" } if the result looks wrong, empty, or like an error.`;

  try {
    const raw = await generate(prompt, {
      model: VERIFICATION_MODEL,
      stream: false,
      format: "json",
    });
    const cleaned = raw.replace(/```(?:json)?\n?/g, "").trim();
    const parsed = JSON.parse(cleaned) as Partial<VerificationResponse>;
    return {
      valid: parsed.valid !== false, // default to valid on ambiguity
      issue: typeof parsed.issue === "string" ? parsed.issue : undefined,
    };
  } catch (e) {
    log.warn("verification_llm_failed", { toolName, error: String(e) });
    /* Silently pass through — do not block the agent on verification errors. */
    return { valid: true };
  }
}

/* ── Processor factory ───────────────────────────────────────────────── */

/**
 * Build the verification gate processor.
 *
 * The returned processor is a no-op when `AGENT_VERIFICATION_ENABLED` is
 * not `"true"`.  Otherwise, it inspects the previous step's tool result
 * in the accumulated context and asks a fast LLM to validate it.
 *
 * Register via:
 * ```typescript
 * agent.addProcessor(createVerificationProcessor());
 * ```
 *
 * @returns A `Processor` that validates the most recent tool result at each step.
 */
export function createVerificationProcessor() {
  return createProcessor({
    async processInputStep(
      args: ProcessInputStepArgs,
    ): Promise<ProcessInputStepArgs | void> {
      /* Skip entirely when the feature is disabled. */
      if (!VERIFICATION_ENABLED) {
        return;
      }

      /* Only verify after the first step — step 0 has no prior tool result. */
      if (args.stepNumber === 0) {
        return;
      }

      /* Look for the last tool result in the accumulated context. */
      const lastResult = extractLastToolResult(args.context);
      if (!lastResult) {
        return;
      }

      log.info("verification_checking", {
        step: args.stepNumber,
        tool: lastResult.toolName,
      });

      const verification = await callVerificationLlm(
        lastResult.toolName,
        lastResult.resultText,
      );

      if (verification.valid) {
        log.info("verification_passed", {
          step: args.stepNumber,
          tool: lastResult.toolName,
        });
        return;
      }

      /* Verification failed — append the issue to context and emit an event. */
      const issue = verification.issue ?? "The tool result did not look correct.";
      log.warn("verification_failed", {
        step: args.stepNumber,
        tool: lastResult.toolName,
        issue,
      });

      emit({
        type: "tool:verification_failed",
        payload: {
          step: args.stepNumber,
          tool: lastResult.toolName,
          issue,
        },
      });

      return {
        ...args,
        context:
          args.context +
          `\n[Verification] The previous "${lastResult.toolName}" result may be incorrect: ${issue}. Please review and adjust your next action accordingly.`,
      };
    },
  });
}
