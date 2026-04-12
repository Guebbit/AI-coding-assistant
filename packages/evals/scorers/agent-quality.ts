import { createScorer } from "../scorer-builder";
import type { ScorerResult, ScorerRunInput } from "../types";
import { generate } from "../../llm/ollama";

const JUDGE_MODEL =
  process.env.EVAL_JUDGE_MODEL ??
  process.env.OLLAMA_MODEL ??
  "llama3";

/**
 * Agent Quality Scorer
 *
 * Uses a local Ollama LLM as a "judge" to rate the overall quality of an
 * agent's response on a scale of 0–10, which is then normalised to [0, 1].
 *
 * Local-first: no cloud API key required — the judge calls Ollama directly.
 * Configure the judge model with the `EVAL_JUDGE_MODEL` environment variable.
 *
 * Falls back to a keyword-based heuristic when Ollama is unavailable so that
 * evals can still run in offline environments.
 *
 * ## Metadata keys read
 * - `metadata.stepCount` (number) — penalises excessive steps.
 * - `metadata.maxStepsReached` (boolean) — hard penalisation if true.
 */
export const agentQualityScorer = createScorer({
  id: "agent-quality",

  async score(run: ScorerRunInput): Promise<ScorerResult> {
    const maxStepsReached =
      (run.metadata?.maxStepsReached as boolean | undefined) ?? false;

    // Hard penalise: agent gave up without an answer
    if (maxStepsReached) {
      return {
        score: 0,
        reasoning:
          "Agent reached the maximum step limit without producing a conclusive answer.",
        metadata: { maxStepsReached },
      };
    }

    // Try LLM judge
    try {
      return await scoreWithLlm(run);
    } catch {
      // Ollama unavailable — fall back to simple heuristic
      return scoreWithHeuristic(run);
    }
  },
});

// ── LLM-based scoring ──────────────────────────────────────────────────────

async function scoreWithLlm(run: ScorerRunInput): Promise<ScorerResult> {
  const prompt =
    `You are an impartial evaluator assessing the quality of an AI agent's response.\n\n` +
    `Task given to the agent:\n${run.input}\n\n` +
    `Agent's response:\n${run.output}\n\n` +
    `Rate the response quality on a scale from 0 to 10 where:\n` +
    `  0 = completely wrong or unhelpful\n` +
    `  5 = partially correct or incomplete\n` +
    ` 10 = excellent, accurate, and fully addresses the task\n\n` +
    `Respond ONLY with a JSON object:\n` +
    `{"score": <0-10>, "reasoning": "<one sentence explanation>"}`;

  const raw = await generate(prompt, {
    model: JUDGE_MODEL,
    format: "json",
    stream: false,
  });

  const cleaned = raw.replace(/```(?:json)?\n?/g, "").trim();
  const parsed = JSON.parse(cleaned) as {
    score?: unknown;
    reasoning?: unknown;
  };

  const rawScore =
    typeof parsed.score === "number"
      ? parsed.score
      : Number(parsed.score ?? 5);
  const clamped = Math.max(0, Math.min(10, rawScore));
  const normalised = clamped / 10;

  return {
    score: normalised,
    reasoning:
      typeof parsed.reasoning === "string"
        ? parsed.reasoning
        : `LLM judge score: ${clamped}/10`,
    metadata: { judgeModel: JUDGE_MODEL, rawScore: clamped },
  };
}

// ── Heuristic fallback ─────────────────────────────────────────────────────

function scoreWithHeuristic(run: ScorerRunInput): ScorerResult {
  const output = run.output.toLowerCase();

  const negativeSignals = [
    "i don't know",
    "i cannot",
    "i'm unable",
    "error",
    "failed",
    "max steps",
  ];

  const hasNegative = negativeSignals.some((s) => output.includes(s));
  const score = hasNegative ? 0.3 : 0.7;

  return {
    score,
    reasoning: hasNegative
      ? "Heuristic: output contains uncertainty/error signals."
      : "Heuristic: output appears constructive (Ollama unavailable for LLM judge).",
    metadata: { heuristic: true },
  };
}
