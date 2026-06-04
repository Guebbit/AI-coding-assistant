/**
 * Persistence package types — data shapes for all persisted run records.
 *
 * These types mirror the PostgreSQL schema defined in
 * `migrations/001_initial.sql` and are shared between the DB layer and
 * any consumer that reads/writes run records.
 *
 * @module persistence/types
 */

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

/** Status of a finished agent run. */
export type RunStatus = 'completed' | 'max_steps' | 'error' | 'hard_stopped';

/**
 * Input payload for {@link saveAgentRun}.
 *
 * All nullable fields are optional — callers should supply as much data
 * as they have but are never forced to provide every field.
 */
export interface IAgentRunInput {
    task: string;
    agentProfile?: string | null;
    input?: Record<string, unknown> | null;
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

/* ── Eval result ─────────────────────────────────────────────────────────── */

/**
 * Input payload for {@link saveEvalResult}.
 */
export interface IEvalResultInput {
    /** UUID of the associated agent run (optional). */
    runId?: string | null;
    /** Whether `runId` points to an agent run. */
    runType?: 'agent' | null;
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

/* ── Chat ────────────────────────────────────────────────────────────────── */

/** Role of a chat message sender. */
export type ChatRole = 'user' | 'assistant' | 'system';

/** A single message within a conversation. */
export interface IChatMessage {
    id: string;
    conversationId: string;
    role: ChatRole;
    content: string;
    createdAt: Date;
    updatedAt: Date;
}

/** A conversation row without its messages (used in list responses). */
export interface IConversation {
    id: string;
    title: string;
    profile: string | null;
    createdAt: Date;
    updatedAt: Date;
}

/** A conversation with its full message history. */
export interface IConversationWithMessages extends IConversation {
    messages: IChatMessage[];
}

/** Input for creating a conversation. */
export interface ICreateConversationInput {
    title?: string;
    profile?: string | null;
}

/** Input for updating a conversation. */
export interface IUpdateConversationInput {
    title?: string;
    profile?: string | null;
}

/** Input for creating a chat message. */
export interface ICreateMessageInput {
    role: ChatRole;
    content: string;
}

/** Input for updating a chat message. */
export interface IUpdateMessageInput {
    content: string;
}

/* ── Library ─────────────────────────────────────────────────────────────── */

/** A library row as stored in PostgreSQL. */
export interface ILibraryRecord {
    id: string;
    name: string;
    config: Record<string, unknown>;
    articleCount: number;
    lastImportAt: Date | null;
    createdAt: Date;
}

/** Input for creating/upserting a library. */
export interface IUpsertLibraryInput {
    id: string;
    name: string;
    config?: Record<string, unknown>;
}

/** A library article row as stored in PostgreSQL. */
export interface ILibraryArticleRecord {
    id: string;
    libraryId: string;
    title: string;
    summary: string;
    topics: string[];
    year: number | null;
    month: string | null;
    startPage: number;
    endPage: number | null;
    pdfPath: string;
    pdfPageOffset: number;
    qdrantPointId: string;
    createdAt: Date;
}

/** Input for inserting an article. */
export interface ICreateArticleInput {
    libraryId: string;
    title: string;
    summary: string;
    topics: string[];
    year?: number | null;
    month?: string | null;
    startPage: number;
    endPage?: number | null;
    pdfPath: string;
    pdfPageOffset?: number;
    qdrantPointId: string;
}

/* ── Activity log (MongoDB) ─────────────────────────────────────────────── */

/** Append-only activity-log categories emitted by runtime + API lifecycle events. */
export type ActivityLogCategory = 'agent' | 'tool' | 'workflow' | 'chat' | 'api' | 'system';

/** Input payload for creating one append-only activity-log document. */
export interface IActivityLogInput {
    timestamp?: Date;
    kind: string;
    category: ActivityLogCategory | string;
    type: string;
    conversationId?: string;
    messageId?: string;
    requestId?: string;
    runId?: string;
    workflowId?: string;
    subtaskId?: string;
    parentId?: string;
    profile?: string;
    toolName?: string;
    status?: string;
    data: Record<string, unknown>;
    meta?: Record<string, unknown>;
}

/** Public activity-log record returned by the history API. */
export interface IActivityLogRecord extends IActivityLogInput {
    id: string;
    timestamp: Date;
}

/** Filter options shared by list/export/delete activity-log operations. */
export interface IActivityLogFilters {
    kind?: string;
    category?: string;
    type?: string;
    conversationId?: string;
    messageId?: string;
    requestId?: string;
    runId?: string;
    workflowId?: string;
    subtaskId?: string;
    parentId?: string;
    profile?: string;
    toolName?: string;
    status?: string;
}

/** Query options for incremental activity-log history fetches. */
export interface IActivityLogQueryOptions extends IActivityLogFilters {
    since?: string;
    limit?: number;
}

/** Result shape for incremental activity-log history fetches. */
export interface IActivityLogQueryResult {
    entries: IActivityLogRecord[];
    nextCursor?: string;
    hasMore: boolean;
}

/* ── Shared query options ────────────────────────────────────────────────── */

/** Options for {@link fetchRecentRuns}. */
export interface IFetchRecentRunsOptions {
    /** Maximum number of rows to return. Defaults to 20. */
    limit?: number;
    /** Filter by status. */
    status?: RunStatus;
}
