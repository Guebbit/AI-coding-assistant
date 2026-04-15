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

export * from './env';
export * from './path-safety';
export * from './chunker';
export * from './response';
export * from './errors';
export * from './environment';
