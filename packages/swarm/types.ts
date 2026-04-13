/**
 * Swarm orchestration types — data contracts for multi-agent task
 * decomposition, delegation, and result aggregation.
 *
 * The swarm pattern decomposes a complex user task into smaller subtasks,
 * each assigned to a specialised {@link Agent} instance that runs
 * independently.  An orchestrator collects all subtask results and
 * synthesises a final answer.
 *
 * @module swarm/types
 */

import type { ModelProfile } from '../agent/model-router';

/* ── Subtask ─────────────────────────────────────────────────────────── */

/**
 * A single subtask produced by the decomposer.
 *
 * Each subtask carries enough information for the orchestrator to
 * select the right agent and profile, then delegate execution.
 */
export interface ISubtask {
    /** Unique identifier for this subtask (e.g. `"subtask-0"`). */
    id: string;

    /** Human-readable description of what this subtask should accomplish. */
    description: string;

    /**
     * Suggested model profile for this subtask.
     * The orchestrator may override this based on budget or other heuristics.
     */
    profile: ModelProfile;

    /**
     * IDs of subtasks that must complete before this one can start.
     * An empty array means the subtask has no dependencies and can
     * run as soon as the orchestrator is ready.
     */
    dependsOn: string[];
}

/* ── Decomposition result ────────────────────────────────────────────── */

/**
 * The structured output of the task decomposer.
 *
 * Contains the ordered list of subtasks and a short rationale
 * explaining the decomposition strategy.
 */
export interface IDecomposition {
    /** Ordered list of subtasks. */
    subtasks: ISubtask[];

    /** Short explanation of the decomposition strategy (for diagnostics). */
    reasoning: string;
}

/* ── Subtask result ──────────────────────────────────────────────────── */

/**
 * The outcome of executing a single subtask through an Agent.
 */
export interface ISubtaskResult {
    /** The subtask that was executed. */
    subtask: ISubtask;

    /** The final answer returned by the agent. */
    answer: string;

    /** Wall-clock duration of this subtask's execution in milliseconds. */
    durationMs: number;

    /** Whether the subtask completed successfully (agent returned a result). */
    success: boolean;

    /** Error message if the subtask failed. */
    error?: string;
}

/* ── Swarm result ────────────────────────────────────────────────────── */

/**
 * The final result returned by the swarm orchestrator.
 */
export interface ISwarmResult {
    /** The synthesised final answer combining all subtask results. */
    answer: string;

    /** Individual results for each subtask (in execution order). */
    subtaskResults: ISubtaskResult[];

    /** Total wall-clock duration of the entire swarm run in milliseconds. */
    totalDurationMs: number;

    /** The decomposition that drove this run (for diagnostics / logging). */
    decomposition: IDecomposition;
}

/* ── Swarm configuration ─────────────────────────────────────────────── */

/**
 * Configuration for the swarm orchestrator.
 *
 * All fields are optional — sensible defaults are applied when omitted.
 */
export interface ISwarmConfig {
    /**
     * Maximum number of subtasks the decomposer is allowed to produce.
     * Prevents runaway decomposition on vague or very complex tasks.
     * @default 6
     */
    maxSubtasks?: number;

    /**
     * Whether write tools should be available to subtask agents.
     * @default false
     */
    allowWrite?: boolean;

    /**
     * Optional profile override applied to every subtask agent,
     * bypassing the decomposer's per-subtask suggestions.
     */
    profileOverride?: ModelProfile;
}
