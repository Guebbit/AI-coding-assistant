import type { Processor } from "./types";

/**
 * Convenience factory for creating `Processor` objects.
 *
 * Equivalent to writing `const p: Processor = { ... }` but provides
 * Mastra-compatible naming and guarantees the returned value satisfies the
 * `Processor` interface.
 *
 * ## Usage
 * ```typescript
 * import { createProcessor } from "../processors";
 *
 * // Inject a timestamp into the context before each LLM call
 * const timestampProcessor = createProcessor({
 *   processInputStep(args) {
 *     return {
 *       ...args,
 *       context: `[${new Date().toISOString()}]\n${args.context}`,
 *     };
 *   },
 * });
 *
 * agent.addProcessor(timestampProcessor);
 * ```
 */
export function createProcessor(processor: Processor): Processor {
  return processor;
}
