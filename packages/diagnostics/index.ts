/**
 * Public surface of the diagnostics package.
 *
 * Re-exports all types and functions so consumers can import from a
 * single entry point:
 *
 * ```typescript
 * import { writeDiagnosticLog, cleanupOldLogs } from "../diagnostics";
 * import type { IDiagnosticEntry } from "../diagnostics";
 * ```
 *
 * @module diagnostics
 */

export * from './types';
export * from './writer';
export * from './cleanup';
