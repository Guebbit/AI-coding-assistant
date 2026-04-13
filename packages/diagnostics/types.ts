/**
 * Diagnostic types — data shapes used by the diagnostics writer.
 *
 * Each `DiagnosticEntry` captures a complete snapshot of an agent run
 * (successful or failed) including a step-by-step timeline, all errors
 * encountered, and an AI-generated commentary explaining what happened.
 *
 * These entries are rendered as human-readable Markdown files so that
 * the operator can understand failures without reading raw logs.
 *
 * @module diagnostics/types
 */

/**
 * High-level outcome of an agent run.
 *
 * - `success`              — the agent completed with `action: "none"`.
 * - `max_steps_exhausted`  — the loop ran out of steps without completing.
 * - `context_overflow`     — context exceeded the budget ceiling; user paused.
 * - `error`                — an unhandled exception terminated the run.
 */
export type DiagnosticOutcome =
  | "success"
  | "max_steps_exhausted"
  | "context_overflow"
  | "error";

/**
 * A single entry in the step-by-step timeline of an agent run.
 *
 * One entry is added per loop iteration regardless of whether the step
 * succeeded, failed, or self-corrected.
 */
export interface DiagnosticTimelineEntry {
  /** Zero-based step index within the agent loop. */
  step: number;

  /** The model profile chosen for this step (fast / reasoning / code / default). */
  profile: string;

  /** The action requested by the LLM (tool name, "none", or "invalid_json"). */
  action: string;

  /** Wall-clock time the step took in milliseconds. */
  durationMs: number;

  /**
   * Whether the step succeeded or encountered a problem.
   *
   * - `success`      — tool executed and returned a result.
   * - `failed`       — tool threw an error.
   * - `invalid_json` — the LLM returned unparseable JSON.
   * - `unknown_tool` — the LLM requested a tool that does not exist.
   * - `none`         — action was "none"; run completed.
   */
  status: "success" | "failed" | "invalid_json" | "unknown_tool" | "none";

  /** Additional context (error message, correction note, etc.). */
  detail?: string;
}

/**
 * A single error event that occurred during an agent run.
 *
 * Multiple errors may occur in a single run (e.g., tool retries,
 * JSON self-corrections).  All are collected for the diagnostic report.
 */
export interface DiagnosticError {
  /** Step index where the error occurred. */
  step: number;

  /**
   * Broad category of the error.
   *
   * - `tool_error`    — tool.execute() threw.
   * - `invalid_json`  — LLM returned invalid JSON.
   * - `unknown_tool`  — LLM requested a non-existent tool.
   * - `llm_error`     — the LLM call itself failed.
   */
  type: "tool_error" | "invalid_json" | "unknown_tool" | "llm_error";

  /** Human-readable description of what went wrong. */
  detail: string;
}

/**
 * A complete snapshot of an agent run, written to a Markdown diagnostic file.
 *
 * Covers both successful runs that encountered recoveries and failed runs.
 * The `aiCommentary` and `suggestion` fields are populated by a fast LLM call
 * at the end of the run.
 */
export interface DiagnosticEntry {
  /** ISO 8601 timestamp when the diagnostic was captured. */
  timestamp: string;

  /** The original task submitted by the user. */
  task: string;

  /** High-level outcome of the run. */
  outcome: DiagnosticOutcome;

  /** Total number of loop iterations that were executed. */
  stepsCompleted: number;

  /** Full accumulated context string at the end of the run. */
  contextSnapshot: string;

  /**
   * Deduplicated list of tool names that were invoked at least once
   * (successfully or unsuccessfully) during the run.
   */
  toolsUsed: string[];

  /** Ordered timeline of all steps executed during the run. */
  timeline: DiagnosticTimelineEntry[];

  /** All errors encountered during the run, in the order they occurred. */
  errors: DiagnosticError[];

  /** Short human-readable description of why the run did not complete (if applicable). */
  failureReason?: string;

  /**
   * LLM-generated narrative explaining what happened, why the agent got stuck
   * (if applicable), and what was tried.
   */
  aiCommentary?: string;

  /** LLM-generated suggestions for the operator (e.g., rephrase task, break down). */
  suggestion?: string;
}
