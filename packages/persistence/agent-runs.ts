/**
 * Agent/eval run persistence — INSERT + query helpers.
 *
 * WHY: Groups all "run history" CRUD in one place (SRP).
 * Each function is fail-open via `withClient` from `./pool`.
 *
 * @module persistence/agent-runs
 */

import { logger } from '../logger/logger';
import { withClient } from './pool';
import type {
    IAgentRunInput,
    IAgentRunRecord,
    IEvalResultInput,
    IEvalResultRecord,
    IFetchRecentRunsOptions
} from './types';

/* ── saveAgentRun ────────────────────────────────────────────────────────── */

/**
 * Persist the result of a single Agent.run() call.
 *
 * @returns The saved record (with generated `id` and `createdAt`), or
 *          `null` when the database is unavailable.
 */
export async function saveAgentRun(input: IAgentRunInput): Promise<IAgentRunRecord | null> {
    return withClient(async (client) => {
        const { rows } = await client.query<IAgentRunRecord>(
            `INSERT INTO agent_runs
                (task, agent_profile, input, output, context, memory,
                 start_time, end_time, duration_ms,
                 tool_calls, diagnostic_log, status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
             RETURNING
                id, task, agent_profile AS "agentProfile",
                input, output, context,
                memory, start_time AS "startTime", end_time AS "endTime",
                duration_ms AS "durationMs",
                tool_calls AS "toolCalls",
                diagnostic_log AS "diagnosticLog",
                status, created_at AS "createdAt"`,
            [
                input.task,
                input.agentProfile ?? null,
                input.input ? JSON.stringify(input.input) : null,
                input.output,
                input.context ?? null,
                input.memory ? JSON.stringify(input.memory) : null,
                input.startTime,
                input.endTime,
                input.durationMs,
                input.toolCalls ? JSON.stringify(input.toolCalls) : null,
                input.diagnosticEntries ? JSON.stringify(input.diagnosticEntries) : null,
                input.status
            ]
        );
        const row = rows[0];
        logger.info('persistence_agent_run_saved', {
            component: 'persistence.db',
            id: row.id,
            status: row.status
        });
        return row;
    });
}

/* ── saveEvalResult ──────────────────────────────────────────────────────── */

/**
 * Persist a single eval scorer result.
 *
 * @returns The saved record, or `null` when the database is unavailable.
 */
export async function saveEvalResult(input: IEvalResultInput): Promise<IEvalResultRecord | null> {
    return withClient(async (client) => {
        const { rows } = await client.query<IEvalResultRecord>(
            `INSERT INTO eval_results
                (run_id, run_type, scorer, score, reasoning, metadata)
             VALUES ($1,$2,$3,$4,$5,$6)
             RETURNING
                id,
                run_id AS "runId", run_type AS "runType",
                scorer, score, reasoning, metadata,
                created_at AS "createdAt"`,
            [
                input.runId ?? null,
                input.runType ?? null,
                input.scorer,
                input.score,
                input.reasoning,
                input.metadata ? JSON.stringify(input.metadata) : null
            ]
        );
        const row = rows[0];
        logger.info('persistence_eval_result_saved', {
            component: 'persistence.db',
            id: row.id,
            scorer: row.scorer
        });
        return row;
    });
}

/* ── fetchRecentRuns ─────────────────────────────────────────────────────── */

/**
 * Fetch the most recent agent runs (newest first).
 *
 * @returns Array of run records, or `[]` when the DB is unavailable.
 */
export async function fetchRecentRuns(
    options: IFetchRecentRunsOptions = {}
): Promise<IAgentRunRecord[]> {
    const { limit = 20, status } = options;

    const parameters: unknown[] = [limit];
    let whereClause = '';
    if (status) {
        parameters.push(status);
        whereClause = `WHERE status = $${parameters.length}`;
    }

    const query = `SELECT * FROM agent_runs ${whereClause} ORDER BY created_at DESC LIMIT $1`;

    const result = (await withClient((client) => client.query(query, parameters))) as {
        rows: IAgentRunRecord[];
    } | null;
    return result?.rows ?? [];
}
