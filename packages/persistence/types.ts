/**
 * Persistence package types — data shapes for all persisted run records.
 *
 * These types mirror the PostgreSQL schema defined in
 * `migrations/001_initial.sql` and are shared between the DB layer and
 * any consumer that reads/writes run records.
 *
 * @module persistence/types
 */

import type { IDecomposition, ISubtaskResult } from '../swarm/types';
import type { IDiagnosticEntry } from '../diagnostics/types';

/* ── Agent run ───────────────────────────────────────────────────────────── */

/** A single tool invocation recorded during an agent run. */
export interface IToolCall {
    /** Tool name (matches `ITool.name`). */
    tool: string;
    /** Zero-based step index when the tool was called. */
    step: number;
    /** Input passed to the tool. */
    input: Record<string, unknown>;
    /** Serialised result returned by the tool (or `null` on failure). */
    result: unknown;
    /** Whether the call succeeded. */
    success: boolean;
    /** Error message when `success` is `false`. */
    error?: string;
    /** Wall-clock duration in milliseconds. */
    durationMs: number;
}

/** Status of a finished agent or swarm run. */
export type RunStatus = 'completed' | 'max_steps' | 'error';

/**
 * Input payload for {@link saveAgentRun}.
 *
 * All nullable fields are optional — callers should supply as much data
 * as they have but are never forced to provide every field.
 */
export interface IAgentRunInput {
    task: string;
    agentProfile?: string | null;
    output: string;
    context?: string | null;
    memory?: string[] | null;
    startTime: Date;
    endTime: Date;
    durationMs: number;
    toolCalls?: IToolCall[] | null;
    diagnosticEntries?: IDiagnosticEntry[] | null;
    status: RunStatus;
}

/**
 * Full agent run record as stored in (and returned from) PostgreSQL.
 *
 * Extends {@link IAgentRunInput} with the database-generated fields.
 */
export interface IAgentRunRecord extends IAgentRunInput {
    id: string;
    createdAt: Date;
}

/* ── Swarm run ───────────────────────────────────────────────────────────── */

/**
 * Input payload for {@link saveSwarmRun}.
 */
export interface ISwarmRunInput {
    task: string;
    decomposition: IDecomposition;
    subtasks: IDecomposition['subtasks'];
    results: ISubtaskResult[];
    answer: string;
    startTime: Date;
    endTime: Date;
    totalDurationMs: number;
    status: RunStatus;
}

/**
 * Full swarm run record as stored in (and returned from) PostgreSQL.
 */
export interface ISwarmRunRecord extends ISwarmRunInput {
    id: string;
    createdAt: Date;
}

/* ── Eval result ─────────────────────────────────────────────────────────── */

/**
 * Input payload for {@link saveEvalResult}.
 */
export interface IEvalResultInput {
    /** UUID of the associated agent or swarm run (optional). */
    runId?: string | null;
    /** Whether `runId` points to an agent run or a swarm run. */
    runType?: 'agent' | 'swarm' | null;
    /** Scorer identifier (e.g. `"tool-accuracy"`). */
    scorer: string;
    /** Normalised score in [0, 1]. */
    score: number;
    /** Human-readable reasoning from the scorer. */
    reasoning: string;
    /** Optional extra metadata from the scorer. */
    metadata?: Record<string, unknown> | null;
}

/**
 * Full eval result record as stored in (and returned from) PostgreSQL.
 */
export interface IEvalResultRecord extends IEvalResultInput {
    id: string;
    createdAt: Date;
}

/* ── Shared query options ────────────────────────────────────────────────── */

/** Options for {@link fetchRecentRuns}. */
export interface IFetchRecentRunsOptions {
    /** Which table to query. Defaults to `'agent'`. */
    type?: 'agent' | 'swarm';
    /** Maximum number of rows to return. Defaults to 20. */
    limit?: number;
    /** Filter by status. */
    status?: RunStatus;
}
