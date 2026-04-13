/**
 * Public surface of the shared utilities package.
 *
 * Re-exports environment-variable parsing and path-safety helpers so
 * that consumers can import from a single entry point:
 *
 * ```typescript
 * import { envFloat, envInt, resolveSafePath, resolveInsideRoot } from "../shared";
 * ```
 *
 * @module shared
 */

export { envFloat, envInt } from './env';
export { resolveSafePath, resolveInsideRoot } from './path-safety';
export { chunkText } from './chunker';
export type { IChunk, IChunkOptions } from './chunker';
