import type { Scorer, CreateScorerOptions } from "./types";

/**
 * Factory for creating `Scorer` objects.
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
 */
export function createScorer(options: CreateScorerOptions): Scorer {
  return {
    id: options.id,
    score: options.score,
  };
}
