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
 * @module tools/mysql.query
 */

import mysql from 'mysql2/promise';
import type { ITool } from './types';

/**
 * Tool instance for executing read-only MySQL queries.
 *
 * Input:
 * ```json
 * { "sql": "SELECT id, name FROM users WHERE active = ?", "params": [true] }
 * ```
 */
export const mysqlQueryTool: ITool = {
    name: 'mysql_query',
    description:
        'Execute a read-only SELECT query against MySQL. ' +
        'Input: { sql: string, params?: unknown[] }',

    /**
     * Open a connection, execute the SELECT query, and return the result rows.
     *
     * @param input        - Tool input object.
     * @param input.sql    - SQL query string (must begin with `SELECT`).
     * @param input.params - Optional array of bind-parameter values for prepared statements.
     * @returns The result rows from the query.
     * @throws {Error} When the SQL is empty, not a SELECT, or the connection fails.
     */
    async execute({ sql, params }) {
        if (typeof sql !== 'string' || sql.trim() === '') {
            throw new Error('"sql" must be a non-empty string');
        }

        /* Safety: only allow SELECT statements to prevent mutations. */
        if (!/^\s*SELECT\b/i.test(sql)) {
            throw new Error('Only SELECT queries are permitted. Received: ' + sql.slice(0, 80));
        }

        const connection = await mysql.createConnection({
            host: process.env.MYSQL_HOST ?? 'localhost',
            port: Number.parseInt(process.env.MYSQL_PORT ?? '3306', 10),
            user: process.env.MYSQL_USER ?? 'root',
            password: process.env.MYSQL_PASSWORD ?? '',
            database: process.env.MYSQL_DATABASE ?? '',
            /* Never allow multi-statement execution (defence-in-depth). */
            multipleStatements: false
        });

        try {
            const queryParams = Array.isArray(params) ? params : [];
            const [rows] = await connection.execute(sql, queryParams);
            return rows;
        } finally {
            await connection.end();
        }
    }
};
