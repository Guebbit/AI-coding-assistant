/**
 * Public surface of the processors package.
 *
 * ## Quick start
 * ```typescript
 * import { createProcessor } from "../processors";
 *
 * const loggingProcessor = createProcessor({
 *   async processInputStep({ task, stepNumber }) {
 *     console.log(`Step ${stepNumber} — task: ${task}`);
 *   },
 * });
 *
 * agent.addProcessor(loggingProcessor);
 * ```
 */

export type {
  Processor,
  ProcessInputStepArgs,
  ProcessOutputStepArgs,
} from "./types";

export { createProcessor } from "./processor-builder";
