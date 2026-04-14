/**
 * MongoDB query tool — execute read-only find and aggregate operations.
 *
 * Connection settings are read from environment variables:
 * - `MONGO_URI`        (default: `"mongodb://localhost:27017"`)
 * - `MONGO_DATABASE`   (default: `""`)
 *
 * Only `find` and `aggregate` operations are supported.  Write operations
 * (insertOne, updateMany, deleteOne, drop, etc.) are not exposed.
 *
 * Implements the {@link createDbTool} pattern from `base-db-tool.ts`.
 * See that module for instructions on adding new database engines.
 *
 * @module tools/mongo.query
 */

import { MongoClient, type Document } from 'mongodb';
import { createDbTool } from './base-db-tool';

/** Validated input shape for the MongoDB query tool. */
interface IMongoQueryInput extends Record<string, unknown> {
    /** Target collection name. */
    collection: string;
    /** Operation type: `"find"` or `"aggregate"`. */
    operation: 'find' | 'aggregate';
    /**
     * Filter document for `find`, or pipeline array for `aggregate`.
     * Defaults to `{}` / `[]` when omitted.
     */
    query?: Record<string, unknown> | unknown[];
    /**
     * Maximum number of documents to return (find only, default 100).
     * Capped at 1 000 to prevent runaway result sets.
     */
    limit?: number;
}

/** Maximum number of documents returned by a `find` operation. */
const MAX_FIND_LIMIT = 1_000;

/**
 * Tool instance for executing read-only MongoDB queries.
 *
 * ### find — Input
 * ```json
 * {
 *   "collection": "users",
 *   "operation": "find",
 *   "query": { "active": true },
 *   "limit": 10
 * }
 * ```
 *
 * ### aggregate — Input
 * ```json
 * {
 *   "collection": "orders",
 *   "operation": "aggregate",
 *   "query": [
 *     { "$match": { "status": "completed" } },
 *     { "$group": { "_id": "$customerId", "total": { "$sum": "$amount" } } }
 *   ]
 * }
 * ```
 */
export const mongoQueryTool = createDbTool<IMongoQueryInput>({
    name: 'mongo_query',
    description:
        'Execute a read-only find or aggregate operation against MongoDB. ' +
        'Input: { collection: string, operation: "find"|"aggregate", ' +
        'query?: object|array, limit?: number }',

    /**
     * Validate the raw LLM input for MongoDB operations.
     *
     * @param raw - Untyped input from the LLM.
     * @returns Validated {@link IMongoQueryInput}.
     * @throws {Error} When required fields are missing or have incorrect types.
     */
    validateInput(raw): IMongoQueryInput {
        if (typeof raw.collection !== 'string' || raw.collection.trim() === '') {
            throw new Error('"collection" must be a non-empty string');
        }

        if (raw.operation !== 'find' && raw.operation !== 'aggregate') {
            throw new Error('"operation" must be "find" or "aggregate"');
        }

        /* query defaults to empty filter / pipeline when omitted. */
        if (raw.query !== undefined && typeof raw.query !== 'object') {
            throw new Error('"query" must be an object (filter) or array (pipeline)');
        }

        if (raw.operation === 'aggregate' && raw.query !== undefined && !Array.isArray(raw.query)) {
            throw new Error('"query" must be an array (pipeline) when operation is "aggregate"');
        }

        if (raw.operation === 'find' && raw.query !== undefined && Array.isArray(raw.query)) {
            throw new Error('"query" must be an object (filter) when operation is "find"');
        }

        const limit =
            typeof raw.limit === 'number' ? Math.min(Math.max(1, raw.limit), MAX_FIND_LIMIT) : 100;

        return {
            collection: raw.collection.trim(),
            operation: raw.operation,
            query: raw.query as Record<string, unknown> | unknown[] | undefined,
            limit
        };
    },

    /**
     * Connect to MongoDB, run the find/aggregate, disconnect, and return rows.
     *
     * @param input - Validated tool input.
     * @returns Array of matching documents (JSON-serialisable).
     * @throws {Error} When the connection fails or the operation errors.
     */
    async run({ collection, operation, query, limit }) {
        const uri = process.env.MONGO_URI ?? 'mongodb://localhost:27017';
        const dbName = process.env.MONGO_DATABASE ?? '';

        const client = new MongoClient(uri);
        await client.connect();

        try {
            const db = client.db(dbName || undefined);
            const col = db.collection(collection);

            if (operation === 'find') {
                const filter = (query as Record<string, unknown> | undefined) ?? {};
                return await col.find(filter).limit(limit ?? 100).toArray();
            }

            /* aggregate */
            const pipeline = (query as Document[] | undefined) ?? [];
            return await col.aggregate(pipeline).toArray();
        } finally {
            await client.close();
        }
    }
});
