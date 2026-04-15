/**
 * MySQL query tool — execute read-only SELECT queries.
 *
 * Connection settings are read from environment variables:
 * - `MYSQL_HOST`      (default: `"localhost"`)
 * - `MYSQL_PORT`      (default: `3306`)
 * - `MYSQL_USER`      (default: `"root"`)
 * - `MYSQL_PASSWORD`  (default: `""`)
 * - `MYSQL_DATABASE`  (default: `""`)
 *
 * Only `SELECT` statements are allowed.  Any mutating SQL
 * (INSERT, UPDATE, DELETE, DROP, etc.) is rejected **before** it
 * reaches the database.  Multi-statement execution is disabled at
 * the connection level for defence-in-depth.
 *
 * Implements the {@link createDbTool} pattern from `base-db-tool.ts`.
 * See that module for instructions on adding new database engines.
 *
 * @module tools/mysql.query
 */

import mysql from 'mysql2/promise';
import type { ExecuteValues } from 'mysql2';
import { createDbTool as createDatabaseTool, validateSqlInput } from './base-db-tool';

/** Shared MySQL pool reused across tool calls. */
let mysqlPool: mysql.Pool | null = null;

/**
 * Lazily create (once) and return the shared MySQL pool.
 *
 * @returns Shared MySQL promise pool.
 */
function getMySqlPool(): mysql.Pool {
    if (!mysqlPool) {
        mysqlPool = mysql.createPool({
            host: process.env.MYSQL_HOST ?? 'localhost',
            port: Number.parseInt(process.env.MYSQL_PORT ?? '3306', 10),
            user: process.env.MYSQL_USER ?? 'root',
            password: process.env.MYSQL_PASSWORD ?? '',
            database: process.env.MYSQL_DATABASE ?? '',
            /* Never allow multi-statement execution (defence-in-depth). */
            multipleStatements: false,
            waitForConnections: true,
            connectionLimit: 5,
            queueLimit: 0
        });
    }
    return mysqlPool;
}

/**
 * Tool instance for executing read-only MySQL queries.
 *
 * Input:
 * ```json
 * { "sql": "SELECT id, name FROM users WHERE active = ?", "params": [true] }
 * ```
 */
export const mysqlQueryTool = createDatabaseTool({
    name: 'mysql_query',
    description:
        'Execute a read-only SELECT query against MySQL. ' +
        'Input: { sql: string, params?: unknown[] }',

    validateInput: validateSqlInput,

    /**
     * Execute the SELECT query via a shared connection pool and return rows.
     *
     * @param input        - Validated tool input.
     * @param input.sql    - SQL query string (begins with `SELECT`).
     * @param input.params - Bind-parameter values for prepared statements.
     * @returns The result rows from the query.
     * @throws {Error} When the connection fails or the query errors.
     */
    async run({ sql, params }) {
        const pool = getMySqlPool();
        const [rows] = await pool.execute(sql, params as ExecuteValues[]);
        return rows;
    }
});
