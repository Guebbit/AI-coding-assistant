/**
 * Public surface of the diagnostics package.
 *
 * Re-exports the `writeDiagnosticLog` function and the `DiagnosticEntry`
 * type so consumers can import from a single entry point:
 *
 * ```typescript
 * import { writeDiagnosticLog } from "../diagnostics";
 * import type { DiagnosticEntry } from "../diagnostics";
 * ```
 *
 * @module diagnostics
 */

export { writeDiagnosticLog } from "./writer";
export type {
  DiagnosticEntry,
  DiagnosticOutcome,
  DiagnosticTimelineEntry,
  DiagnosticError,
} from "./types";
