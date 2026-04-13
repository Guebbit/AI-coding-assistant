/**
 * Evals framework types.
 *
 * Modelled after Mastra's eval / scorer pattern:
 *   https://mastra.ai/docs/evals/overview
 *
 * Scorers measure a single quality dimension of an agent run.  They are
 * intentionally simple: receive a run description, return a numeric score
 * between 0 and 1 plus optional reasoning.
 *
 * Keeping it local-first — no cloud LLM required.  Scorers that need LLM
 * judgment can call Ollama directly (see `agent-quality.ts`).
 */

/**
 * The result returned by every scorer.
 *
 * `score` is a normalised value in the range [0, 1] where:
 *   - 1.0 = perfect / fully correct
 *   - 0.0 = completely wrong / failed
 */
export interface IScorerResult {
    /** Normalised quality score: 0 (worst) → 1 (best). */
    score: number;

    /** Human-readable explanation of how the score was derived. */
    reasoning: string;

    /** Optional additional data (e.g. per-step breakdowns). */
    metadata?: Record<string, unknown>;
}

/**
 * Input provided to a scorer for a single agent run.
 */
export interface IScorerRunInput {
    /** The original task / prompt given to the agent. */
    input: string;

    /** The agent's final output / answer. */
    output: string;

    /**
     * Extra context about the run (tool calls made, step count, errors, etc.).
     * Populated by the agent or test harness — scorers are free to ignore it.
     */
    metadata?: Record<string, unknown>;
}

/**
 * A Scorer evaluates one quality dimension of an agent run.
 *
 * Implement this interface directly or use `createScorer()` for a
 * Mastra-compatible, type-safe factory.
 */
export interface IScorer {
    /** Unique identifier for this scorer (e.g. `"tool-accuracy"`). */
    id: string;

    /**
     * Evaluate the run and return a `ScorerResult`.
     *
     * Must never throw — return `{ score: 0, reasoning: "…error…" }` on failure.
     */
    score(run: IScorerRunInput): Promise<IScorerResult>;
}

/**
 * Options for `createScorer`.
 */
export interface ICreateScorerOptions {
    /** Unique identifier for this scorer. */
    id: string;

    /**
     * The scoring function.  Same contract as `Scorer.score` — must never throw.
     */
    score: (run: IScorerRunInput) => Promise<IScorerResult>;
}
