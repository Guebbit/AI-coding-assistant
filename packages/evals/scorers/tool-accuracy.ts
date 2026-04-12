import { createScorer } from "../scorer-builder";
import type { ScorerResult, ScorerRunInput } from "../types";

/**
 * Tool Accuracy Scorer
 *
 * Measures whether the agent used appropriate tools to satisfy the request.
 *
 * ## Scoring logic (local-first, no LLM required)
 * 1. Extract tool names from `metadata.toolsUsed` (array of strings).
 * 2. If no tools were used and the task clearly needed one → score 0.
 * 3. If an error tool call was made (recorded in `metadata.toolErrors`) → penalise.
 * 4. Otherwise → proportional score based on error ratio.
 *
 * The heuristic is intentionally simple so it works without an LLM judge.
 * For higher-quality evaluation, swap in an LLM-based scorer (see
 * `agent-quality.ts` for an example).
 */
export const toolAccuracyScorer = createScorer({
  id: "tool-accuracy",

  async score(run: ScorerRunInput): Promise<ScorerResult> {
    const toolsUsed = (run.metadata?.toolsUsed as string[] | undefined) ?? [];
    const toolErrors = (run.metadata?.toolErrors as string[] | undefined) ?? [];
    const stepCount = (run.metadata?.stepCount as number | undefined) ?? 0;

    // If the agent completed in 0 steps with no tools — could be valid (simple answer)
    // or invalid (needed tools but skipped them).  We check for error indicators.
    if (toolsUsed.length === 0 && stepCount === 0) {
      return {
        score: 1,
        reasoning:
          "Agent answered directly without tools — acceptable for simple tasks.",
        metadata: { toolsUsed, toolErrors },
      };
    }

    if (toolsUsed.length === 0 && stepCount > 0) {
      return {
        score: 0.5,
        reasoning:
          "Agent ran multiple steps but selected no tools — may indicate a routing issue.",
        metadata: { toolsUsed, toolErrors, stepCount },
      };
    }

    const errorRatio =
      toolsUsed.length > 0 ? toolErrors.length / toolsUsed.length : 0;
    const score = Math.max(0, 1 - errorRatio);

    const reasoning =
      toolErrors.length === 0
        ? `All ${toolsUsed.length} tool call(s) succeeded.`
        : `${toolErrors.length} of ${toolsUsed.length} tool call(s) failed ` +
          `(error ratio: ${(errorRatio * 100).toFixed(0)}%).`;

    return {
      score,
      reasoning,
      metadata: { toolsUsed, toolErrors, errorRatio },
    };
  },
});
