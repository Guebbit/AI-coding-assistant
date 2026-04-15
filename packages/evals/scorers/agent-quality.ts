/**
 * Agent Quality Scorer — LLM-judge scorer for overall response quality.
 *
 * Uses a local Ollama LLM as an impartial "judge" to rate the
 * quality of an agent's response on a 0–10 scale, then normalises
 * the score to the standard [0, 1] range.
 *
 * **Local-first**: no cloud API key required — the judge calls
 * Ollama directly.  Configure the judge model with the
 * `EVAL_JUDGE_MODEL` environment variable.
 *
 * Falls back to a keyword-based heuristic when Ollama is unavailable
 * so that evals can still run in offline environments.
 *
 * ## Metadata keys read
 * - `metadata.maxStepsReached` (boolean) — hard penalty if `true`.
 *
 * @module evals/scorers/agent-quality
 */

import { createScorer } from '../scorer-builder';
import type { IScorerResult, IScorerRunInput } from '../types';
import { generate } from '../../llm/ollama';
import { stripCodeFences } from '../../shared';

/** Model used to judge response quality — configurable via env var. */
const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL ?? process.env.OLLAMA_MODEL ?? 'llama3';

/**
 * Exported scorer instance.
 *
 * Registered as `"agent-quality"` in the eval harness.
 */
export const agentQualityScorer = createScorer({
    id: 'agent-quality',

    /**
     * Score a single agent run for overall quality.
     *
     * @param run - The run to evaluate (input, output, metadata).
     * @returns A normalised `ScorerResult` in [0, 1].
     */
    async score(run: IScorerRunInput): Promise<IScorerResult> {
        const maxStepsReached = (run.metadata?.maxStepsReached as boolean | undefined) ?? false;

        /* Hard penalty: agent exhausted all steps without answering. */
        if (maxStepsReached) {
            return {
                score: 0,
                reasoning:
                    'Agent reached the maximum step limit without producing a conclusive answer.',
                metadata: { maxStepsReached }
            };
        }

        /* Try the LLM judge first; fall back to heuristic on failure. */
        return scoreWithLlm(run).catch(() => scoreWithHeuristic(run));
    }
});

/* ── LLM-based scoring ──────────────────────────────────────────────── */

/**
 * Evaluate response quality by prompting a local LLM "judge".
 *
 * The judge is asked to return a JSON object with a numeric score
 * (0–10) and a one-sentence reasoning.  The score is clamped and
 * normalised to [0, 1].
 *
 * @param run - The agent run to evaluate.
 * @returns A normalised `ScorerResult`.
 * @throws {Error} When the LLM is unreachable or returns unparseable output.
 */
async function scoreWithLlm(run: IScorerRunInput): Promise<IScorerResult> {
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
        format: 'json',
        stream: false
    });

    const cleaned = stripCodeFences(raw);
    const parsed = JSON.parse(cleaned) as {
        score?: unknown;
        reasoning?: unknown;
    };

    /* Clamp raw score to [0, 10] and normalise to [0, 1]. */
    const rawScore = typeof parsed.score === 'number' ? parsed.score : Number(parsed.score ?? 5);
    const clamped = Math.max(0, Math.min(10, rawScore));
    const normalised = clamped / 10;

    return {
        score: normalised,
        reasoning:
            typeof parsed.reasoning === 'string'
                ? parsed.reasoning
                : `LLM judge score: ${clamped}/10`,
        metadata: { judgeModel: JUDGE_MODEL, rawScore: clamped }
    };
}

/* ── Heuristic fallback ─────────────────────────────────────────────── */

/**
 * Simple keyword-based heuristic used when Ollama is unavailable.
 *
 * Checks the agent output for negative signals (uncertainty, errors)
 * and returns a conservative score.
 *
 * @param run - The agent run to evaluate.
 * @returns A heuristic `ScorerResult`.
 */
function scoreWithHeuristic(run: IScorerRunInput): IScorerResult {
    const output = run.output.toLowerCase();

    /** Phrases that indicate the agent failed or was uncertain. */
    const negativeSignals = [
        "i don't know",
        'i cannot',
        "i'm unable",
        'error',
        'failed',
        'max steps'
    ];

    const hasNegative = negativeSignals.some((s) => output.includes(s));
    const score = hasNegative ? 0.3 : 0.7;

    return {
        score,
        reasoning: hasNegative
            ? 'Heuristic: output contains uncertainty/error signals.'
            : 'Heuristic: output appears constructive (Ollama unavailable for LLM judge).',
        metadata: { heuristic: true }
    };
}
