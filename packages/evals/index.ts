/**
 * Public surface of the evals package.
 *
 * Adopting Mastra's eval / scorer naming conventions for future compatibility.
 *
 * ## Quick start
 * ```typescript
 * import { toolAccuracyScorer, agentQualityScorer, createScorer } from "../evals";
 *
 * // Built-in scorers
 * const toolResult = await toolAccuracyScorer.score({
 *   input: "List files in /tmp",
 *   output: "file1.txt, file2.txt",
 *   metadata: { toolsUsed: ["shell"], toolErrors: [], stepCount: 1 },
 * });
 *
 * // Custom scorer
 * const lengthScorer = createScorer({
 *   id: "response-length",
 *   async score({ output }) {
 *     return {
 *       score: Math.min(1, output.length / 200),
 *       reasoning: `Output length: ${output.length} chars`,
 *     };
 *   },
 * });
 * ```
 */

export type { IScorer, IScorerResult, IScorerRunInput, ICreateScorerOptions } from './types';

export { createScorer } from './scorer-builder';

export { toolAccuracyScorer } from './scorers/tool-accuracy';
export { agentQualityScorer } from './scorers/agent-quality';
