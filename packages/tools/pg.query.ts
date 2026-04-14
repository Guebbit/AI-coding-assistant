/**
 * PostgreSQL query tool — execute read-only SELECT queries.
 *
 * Connection settings are read from environment variables:
 * - `PG_HOST`      (default: `"localhost"`)
 * - `PG_PORT`      (default: `5432`)
 * - `PG_USER`      (default: `"postgres"`)
 * - `PG_PASSWORD`  (default: `""`)
 * - `PG_DATABASE`  (default: `""`)
 *
 * Only `SELECT` statements are allowed.  Any mutating SQL
 * (INSERT, UPDATE, DELETE, DROP, etc.) is rejected **before** it
 * reaches the database.
 *
 * Implements the {@link createDbTool} pattern from `base-db-tool.ts`.
 * See that module for instructions on adding new database engines.
 *
 * @module tools/pg.query
 */

import pg from 'pg';
import { createDbTool, validateSqlInput } from './base-db-tool';

/**
 * Tool instance for executing read-only PostgreSQL queries.
 *
 * Input:
 * ```json
 * { "sql": "SELECT id, name FROM users WHERE active = $1", "params": [true] }
 * ```
 *
 * Note: PostgreSQL uses numbered placeholders (`$1`, `$2`, …) rather than
 * the `?` style used by MySQL.
 */
export const pgQueryTool = createDbTool({
    name: 'pg_query',
    description:
        'Execute a read-only SELECT query against PostgreSQL. ' +
        'Input: { sql: string, params?: unknown[] }. ' +
        'Use $1, $2, … placeholders for parameterised queries.',

    validateInput: validateSqlInput,

    /**
     * Open a connection, execute the SELECT query, and return the result rows.
     *
     * @param input        - Validated tool input.
     * @param input.sql    - SQL query string (begins with `SELECT`).
     * @param input.params - Bind-parameter values for prepared statements.
     * @returns The result rows from the query.
     * @throws {Error} When the connection fails or the query errors.
     */
    async run({ sql, params }) {
        const client = new pg.Client({
            host: process.env.PG_HOST ?? 'localhost',
            port: Number.parseInt(process.env.PG_PORT ?? '5432', 10),
            user: process.env.PG_USER ?? 'postgres',
            password: process.env.PG_PASSWORD ?? '',
            database: process.env.PG_DATABASE ?? ''
        });

        await client.connect();

        try {
            const result = await client.query(sql, params);
            return result.rows;
        } finally {
            await client.end();
        }
    }
});
