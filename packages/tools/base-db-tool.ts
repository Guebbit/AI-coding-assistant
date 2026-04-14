/**
 * Base database tool abstraction — shared interface and lifecycle helpers
 * for all database-backed agent tools.
 *
 * ## Architecture overview
 *
 * ```
 * ITool  (packages/tools/types.ts)
 *   └── BaseDbTool  (this file)           ← shared lifecycle + validation
 *         ├── mysqlQueryTool              (mysql.query.ts)
 *         ├── pgQueryTool                 (pg.query.ts)
 *         └── mongoQueryTool              (mongo.query.ts)
 * ```
 *
 * ## How to add a new database engine
 *
 * 1. Install the Node.js driver for your DB (e.g. `npm install oracledb`).
 * 2. Add `@types/<driver>` to `devDependencies` if the package does not
 *    ship its own types.
 * 3. Create `packages/tools/<engine>.query.ts` and define a tool that:
 *    - Reads connection config from environment variables using a dedicated
 *      prefix (e.g. `ORACLE_HOST`, `ORACLE_PORT`, …).
 *    - Validates the input with {@link validateSqlInput} (SQL engines)
 *      or your own input guard (NoSQL engines).
 *    - Opens a connection, runs the operation, closes the connection in a
 *      `finally` block, and returns a JSON-serialisable result.
 * 4. Export the new tool from `packages/tools/index.ts`.
 * 5. Register the tool in `apps/api/agents.ts` (conditionally on env vars).
 * 6. Add a doc page under `docs/packages/tools/<engine>-query.md`.
 * 7. Update `docs/.vitepress/config.mts` to include the new page in the sidebar.
 * 8. Update `AI_README.md` with the new tool name and its env vars.
 *
 * @module tools/base-db-tool
 */

import type { ITool } from './types';

/**
 * Options used by every database tool to describe itself and read its
 * environment-variable connection config.
 *
 * @template TInput - Shape of the tool's input (must be a plain object).
 */
export interface IDbToolOptions<TInput extends Record<string, unknown>> {
    /** Unique tool name exposed to the agent (e.g. `"mysql_query"`). */
    name: string;

    /** Plain-English description forwarded to the LLM. */
    description: string;

    /**
     * Validate the raw LLM input and throw a descriptive `Error` when it
     * does not satisfy the engine's requirements.
     *
     * @param input - Untyped input object from the LLM response.
     * @returns The validated (and narrowed) input.
     */
    validateInput(input: Record<string, unknown>): TInput;

    /**
     * Open a connection, run the query/operation, close the connection, and
     * return a JSON-serialisable result.
     *
     * The connection **must** be closed inside a `finally` block so that it
     * is released even when the query throws.
     *
     * @param input - Already-validated input.
     * @returns JSON-serialisable rows / documents / result set.
     */
    run(input: TInput): Promise<unknown>;
}

/**
 * Build an `ITool` for a database engine.
 *
 * This factory wires together input validation and query execution so that
 * each concrete tool only has to implement the two concerns it cares about
 * (`validateInput` and `run`) without duplicating the surrounding boilerplate.
 *
 * ## Usage
 *
 * ```typescript
 * import { createDbTool } from './base-db-tool';
 *
 * export const myDbTool = createDbTool({
 *   name: 'mydb_query',
 *   description: 'Run read-only queries against MyDB. Input: { query: string }',
 *   validateInput(raw) {
 *     if (typeof raw.query !== 'string' || !raw.query.trim()) {
 *       throw new Error('"query" must be a non-empty string');
 *     }
 *     return raw as { query: string };
 *   },
 *   async run({ query }) {
 *     const client = await openConnection();
 *     try {
 *       return await client.execute(query);
 *     } finally {
 *       await client.close();
 *     }
 *   },
 * });
 * ```
 *
 * @template TInput - Narrowed input type returned by `validateInput`.
 * @param options - Tool configuration (see {@link IDbToolOptions}).
 * @returns A fully-formed `ITool` ready to be passed to an `Agent`.
 */
export function createDbTool<TInput extends Record<string, unknown>>(
    options: IDbToolOptions<TInput>
): ITool {
    return {
        name: options.name,
        description: options.description,

        /**
         * Validate the raw LLM input, then delegate to the engine-specific
         * `run` implementation.
         *
         * Errors thrown by either step bubble up unchanged so the agent loop
         * can report them consistently.
         *
         * @param rawInput - Untyped object from the LLM response.
         * @returns JSON-serialisable query result.
         */
        async execute(rawInput: Record<string, unknown>): Promise<unknown> {
            const validated = options.validateInput(rawInput);
            return options.run(validated);
        }
    };
}

/**
 * Validate a SQL input object shared by SQL-engine tools (MySQL, PostgreSQL).
 *
 * Rules:
 * - `sql` must be a non-empty string.
 * - `sql` must begin with the keyword `SELECT` (case-insensitive).
 * - `params` (optional) must be an array when provided.
 *
 * @param raw - Raw LLM input.
 * @returns `{ sql: string; params: unknown[] }` if validation passes.
 * @throws {Error} When `sql` is missing, empty, or not a SELECT statement.
 */
export function validateSqlInput(raw: Record<string, unknown>): {
    sql: string;
    params: unknown[];
} {
    if (typeof raw.sql !== 'string' || raw.sql.trim() === '') {
        throw new Error('"sql" must be a non-empty string');
    }

    /* Safety: only allow SELECT statements to prevent mutations. */
    if (!/^\s*select\b/i.test(raw.sql)) {
        throw new Error(
            'Only SELECT queries are permitted. Received: ' + raw.sql.slice(0, 80)
        );
    }

    const params = Array.isArray(raw.params) ? raw.params : [];
    return { sql: raw.sql, params };
}
