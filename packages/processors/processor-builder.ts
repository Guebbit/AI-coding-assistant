/**
 * Processor builder — convenience factory for creating `Processor` objects.
 *
 * Equivalent to writing `const p: Processor = { … }` but provides
 * Mastra-compatible naming and guarantees the returned value satisfies
 * the `Processor` interface at the type level.
 *
 * ## Usage
 * ```typescript
 * import { createProcessor } from "../processors";
 *
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
 *
 * @module processors/processor-builder
 */

import type { IProcessor } from './types';

/**
 * Create a `Processor` from a plain object literal.
 *
 * @param processor - An object implementing one or both processor hooks
 *                    (`processInputStep`, `processOutputStep`).
 * @returns The same object, typed as `Processor`.
 */
export function createProcessor(processor: IProcessor): IProcessor {
    return processor;
}
