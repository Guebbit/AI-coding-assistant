/**
 * Diagnostic entry types — shared data shapes for the diagnostics package.
 *
 * These types are used by `writeDiagnosticLog` to record per-incident
 * observations (tool failures, JSON parse errors, budget warnings, etc.)
 * in a structured, timestamped Markdown file.
 *
 * @module diagnostics/types
 */

/**
 * A single timestamped observation recorded during an agent run.
 *
 * Entries are accumulated during the loop and flushed at the end of the
 * run (on `agent:done` or `agent:max_steps`) via `writeDiagnosticLog`.
 */
export interface IDiagnosticEntry {
    /** ISO 8601 timestamp of when the event was recorded. */
    timestamp: string;

    /** Zero-based step index from the agent loop when this entry was created. */
    step: number;

    /** Severity level — mirrors common log levels. */
    severity: 'info' | 'warn' | 'error';

    /**
     * Logical grouping for the entry.
     * Well-known categories: `'tool'`, `'json'`, `'budget'`, `'routing'`.
     */
    category: string;

    /** Human-readable description of what happened. */
    message: string;

    /** Optional structured data to attach to the entry (e.g. error details). */
    metadata?: Record<string, unknown>;
}
