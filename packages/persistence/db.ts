/**
 * Persistence layer — PostgreSQL connection pool and CRUD helpers.
 *
 * ## Design principles
 *
 * - **Fail-open**: every exported function catches all DB errors, logs a
 *   warning, and returns `null` / `[]` so that an unavailable database
 *   never crashes the agent or swarm.
 * - **Lazy initialisation**: the connection pool is created on the first
 *   call and reused thereafter.  Processes that never touch the DB pay
 *   zero connection overhead.
 * - **Type-safe**: all inputs and outputs use the types from `./types`.
 *
 * ## Configuration (environment variables)
 *
 * | Variable            | Default       | Description                    |
 * |---------------------|---------------|--------------------------------|
 * | `MANNA_DB_HOST`     | `localhost`   | PostgreSQL server hostname     |
 * | `MANNA_DB_PORT`     | `5432`        | PostgreSQL server port         |
 * | `MANNA_DB_USER`     | `manna`       | Database user                  |
 * | `MANNA_DB_PASSWORD` | _(empty)_     | Database password              |
 * | `MANNA_DB_NAME`     | `manna`       | Database name                  |
 * | `MANNA_DB_ENABLED`  | `true`        | Set to `false` to disable      |
 *
 * @module persistence/db
 */

import pg from 'pg';
import { logger } from '../logger/logger';
import type {
    IAgentRunInput,
    IAgentRunRecord,
    ISwarmRunInput,
    ISwarmRunRecord,
    IEvalResultInput,
    IEvalResultRecord,
    IFetchRecentRunsOptions
} from './types';

/* ── Configuration ───────────────────────────────────────────────────────── */

/** When `false` all persistence calls become no-ops (returns null / []). */
const DB_ENABLED = process.env.MANNA_DB_ENABLED !== 'false';

const DB_CONFIG: pg.PoolConfig = {
    host: process.env.MANNA_DB_HOST ?? 'localhost',
    port: Number.parseInt(process.env.MANNA_DB_PORT ?? '5432', 10),
    user: process.env.MANNA_DB_USER ?? 'manna',
    password: process.env.MANNA_DB_PASSWORD ?? '',
    database: process.env.MANNA_DB_NAME ?? 'manna',
    /* Keep pool small — persistence is a background concern. */
    max: 3,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000
};

/* ── Pool (lazy singleton) ───────────────────────────────────────────────── */

let _pool: pg.Pool | null = null;

/**
 * Return the shared connection pool, creating it on first call.
 *
 * Exposed for testing; prefer the CRUD helpers for normal use.
 */
export function getPool(): pg.Pool {
    if (!_pool) {
        _pool = new pg.Pool(DB_CONFIG);
        _pool.on('error', (error: Error) => {
            logger.warn('persistence_pool_error', {
                component: 'persistence.db',
                error: error.message
            });
        });
    }
    return _pool;
}

/**
 * Close the shared pool.  Call this during graceful shutdown.
 */
export async function closePool(): Promise<void> {
    if (_pool) {
        await _pool.end();
        _pool = null;
    }
}

/* ── Helper ──────────────────────────────────────────────────────────────── */

/**
 * Execute `fn` with a pooled client.
 *
 * Returns `null` and emits a warning log when the DB is unavailable or
 * `fn` throws, ensuring all callers remain fail-open.
 *
 * @internal
 */
async function withClient<T>(executor: (client: pg.PoolClient) => Promise<T>): Promise<T | null> {
    if (!DB_ENABLED) return null;
    const pool = getPool();
    let client: pg.PoolClient | null = null;
    try {
        client = await pool.connect();
        return await executor(client);
    } catch (error: unknown) {
        logger.warn('persistence_db_error', { component: 'persistence.db', error: String(error) });
        return null;
    } finally {
        client?.release();
    }
}

/* ── saveAgentRun ────────────────────────────────────────────────────────── */

/**
 * Persist the result of a single {@link Agent.run()} call.
 *
 * @example
 * ```typescript
 * import { saveAgentRun } from '../persistence';
 *
 * const record = await saveAgentRun({
 *   task: 'List TypeScript files',
 *   output: 'src/index.ts, src/app.ts',
 *   startTime: new Date(startedAt),
 *   endTime: new Date(),
 *   durationMs: Date.now() - startedAt,
 *   status: 'completed',
 * });
 * if (record) console.log('Saved agent run:', record.id);
 * ```
 *
 * @returns The saved record (with generated `id` and `createdAt`), or
 *          `null` when the database is unavailable.
 */
export async function saveAgentRun(input: IAgentRunInput): Promise<IAgentRunRecord | null> {
    return withClient(async (client) => {
        const { rows } = await client.query<IAgentRunRecord>(
            `INSERT INTO agent_runs
                (task, agent_profile, output, context, memory,
                 start_time, end_time, duration_ms,
                 tool_calls, diagnostic_log, status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             RETURNING
                id, task, agent_profile AS "agentProfile",
                output, context,
                memory, start_time AS "startTime", end_time AS "endTime",
                duration_ms AS "durationMs",
                tool_calls AS "toolCalls",
                diagnostic_log AS "diagnosticLog",
                status, created_at AS "createdAt"`,
            [
                input.task,
                input.agentProfile ?? null,
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

/* ── saveSwarmRun ────────────────────────────────────────────────────────── */

/**
 * Persist the result of a single {@link LangGraphSwarmOrchestrator.run()} call.
 *
 * @example
 * ```typescript
 * import { saveSwarmRun } from '../persistence';
 *
 * const record = await saveSwarmRun({
 *   task: 'Build a REST API',
 *   decomposition,
 *   subtasks: decomposition.subtasks,
 *   results: subtaskResults,
 *   answer: finalAnswer,
 *   startTime: new Date(startedAt),
 *   endTime: new Date(),
 *   totalDurationMs: Date.now() - startedAt,
 *   status: 'completed',
 * });
 * if (record) console.log('Saved swarm run:', record.id);
 * ```
 *
 * @returns The saved record, or `null` when the database is unavailable.
 */
export async function saveSwarmRun(input: ISwarmRunInput): Promise<ISwarmRunRecord | null> {
    return withClient(async (client) => {
        const { rows } = await client.query<ISwarmRunRecord>(
            `INSERT INTO swarm_runs
                (task, decomposition, subtasks, results, answer,
                 start_time, end_time, total_duration_ms, status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             RETURNING
                id, task,
                decomposition, subtasks, results, answer,
                start_time AS "startTime", end_time AS "endTime",
                total_duration_ms AS "totalDurationMs",
                status, created_at AS "createdAt"`,
            [
                input.task,
                JSON.stringify(input.decomposition),
                JSON.stringify(input.subtasks),
                JSON.stringify(input.results),
                input.answer,
                input.startTime,
                input.endTime,
                input.totalDurationMs,
                input.status
            ]
        );
        const row = rows[0];
        logger.info('persistence_swarm_run_saved', {
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
 * @example
 * ```typescript
 * import { saveEvalResult } from '../persistence';
 * import { toolAccuracyScorer } from '../evals';
 *
 * const scorerResult = await toolAccuracyScorer.score({ input, output, metadata });
 * await saveEvalResult({
 *   runId: agentRunRecord?.id,
 *   runType: 'agent',
 *   scorer: toolAccuracyScorer.id,
 *   score: scorerResult.score,
 *   reasoning: scorerResult.reasoning,
 *   metadata: scorerResult.metadata,
 * });
 * ```
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
 * Fetch the most recent agent or swarm runs from the database.
 *
 * @example
 * ```typescript
 * import { fetchRecentRuns } from '../persistence';
 *
 * // Last 10 agent runs
 * const runs = await fetchRecentRuns({ type: 'agent', limit: 10 });
 * console.log('Recent agent runs:', runs.map(r => ({ id: r.id, status: r.status })));
 *
 * // Last 5 swarm runs that completed successfully
 * const swarmRuns = await fetchRecentRuns({ type: 'swarm', limit: 5, status: 'completed' });
 * ```
 *
 * @returns Array of run records (oldest-to-newest order is NOT guaranteed;
 *          rows are returned newest first), or `[]` when the DB is unavailable.
 */
export async function fetchRecentRuns(
    options: IFetchRecentRunsOptions = {}
): Promise<IAgentRunRecord[] | ISwarmRunRecord[]> {
    const { type = 'agent', limit = 20, status } = options;

    const table = type === 'swarm' ? 'swarm_runs' : 'agent_runs';
    const parameters: unknown[] = [limit];
    let whereClause = '';
    if (status) {
        parameters.push(status);
        whereClause = `WHERE status = $${parameters.length}`;
    }

    const query = `SELECT * FROM ${table} ${whereClause} ORDER BY created_at DESC LIMIT $1`;

    /* `withClient` return type is `T | null`; cast to access `.rows` safely
     * since the `pg` module resolution follows the same pattern as pg.query.ts. */
    const result = (await withClient((client) => client.query(query, parameters))) as {
        rows: IAgentRunRecord[] | ISwarmRunRecord[];
    } | null;
    return result?.rows ?? [];
}
