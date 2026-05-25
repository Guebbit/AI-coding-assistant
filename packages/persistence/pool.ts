/**
 * PostgreSQL connection pool — lazy singleton + fail-open executor.
 *
 * WHY: Centralises all pool lifecycle logic so every CRUD module
 * can just call `withClient(fn)` without worrying about connect/release.
 *
 * KEY PATTERN:
 *   `withClient` wraps any DB call in connect→execute→release,
 *   swallowing errors (fail-open) so the app never crashes on DB issues.
 *
 * @module persistence/pool
 */

import pg from 'pg';
import { logger } from '../logger/logger';

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

/* ── Fail-open executor ──────────────────────────────────────────────────── */

/**
 * Execute `fn` with a pooled client.
 *
 * Returns `null` and emits a warning log when the DB is unavailable or
 * `fn` throws, ensuring all callers remain fail-open.
 *
 * @internal
 */
export function withClient<T>(executor: (client: pg.PoolClient) => Promise<T>): Promise<T | null> {
    if (!DB_ENABLED) return Promise.resolve(null);
    const pool = getPool();
    let client: pg.PoolClient | null = null;
    return pool
        .connect()
        .then((c) => {
            client = c;
            return executor(client);
        })
        .catch((error: unknown) => {
            logger.warn('persistence_db_error', {
                component: 'persistence.db',
                error: String(error)
            });
            return null;
        })
        .finally(() => {
            client?.release();
        });
}
