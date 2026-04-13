/**
 * Scorer builder — factory for creating `Scorer` objects.
 *
 * Adopts Mastra's `createScorer` naming for future compatibility.
 *
 * ## Usage
 * ```typescript
 * import { createScorer } from "../evals";
 *
 * const myScorer = createScorer({
 *   id: "my-scorer",
 *   async score({ input, output }) {
 *     const ok = output.toLowerCase().includes("hello");
 *     return { score: ok ? 1 : 0, reasoning: ok ? "greeting found" : "no greeting" };
 *   },
 * });
 *
 * const result = await myScorer.score({ input: "Say hi", output: "Hello!" });
 * console.log(result.score); // 1
 * ```
 *
 * @module evals/scorer-builder
 */

import type { IScorer, ICreateScorerOptions } from './types';

/**
 * Create a `Scorer` from a plain options object.
 *
 * @param options - Configuration for the scorer (`id` and `score` function).
 * @returns A `Scorer` object ready to be used in the eval harness.
 */
export function createScorer(options: ICreateScorerOptions): IScorer {
    return {
        id: options.id,
        score: options.score
    };
}
