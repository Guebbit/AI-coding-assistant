/**
 * Knowledge-graph query tool — traverse and search the Neo4j graph.
 *
 * The tool accepts three mutually-exclusive query modes:
 *
 * 1. **entity** — look up a node by name (exact or case-insensitive).
 * 2. **relationship** — find all relationships of a given type.
 * 3. **cypher** — execute an arbitrary read-only Cypher statement.
 *
 * All modes are **read-only**: write Cypher (`CREATE`, `MERGE`, `DELETE`,
 * `SET`, `REMOVE`, `DETACH`) is blocked at the tool level to prevent the
 * agent from accidentally mutating the graph.
 *
 * **Fail-open**: if Neo4j is unreachable the tool returns an empty result
 * with a `warning` field; it never throws, so the agent loop continues.
 *
 * Input:
 * - `entity`       — entity name to look up (e.g. `"TypeScript"`).
 * - `relationship` — relationship type to list (e.g. `"uses"`).
 * - `cypher`       — raw Cypher `MATCH … RETURN …` query.
 * - `limit`        — max rows to return (default 25, max 200).
 *
 * Output: `{ rows, rowCount, query, warning? }`.
 *
 * @module tools/knowledge.graph.query
 */

import { z } from 'zod';
import { createTool } from './tool-builder';
import { runCypher, isGraphAvailable } from '../graph/client';
import { getLogger } from '../logger/logger';
import type { IGraphQueryResult } from '../graph/types';

const log = getLogger('tool:query_knowledge_graph');

/* ── Safety: block write Cypher ─────────────────────────────────────── */

/** Keywords that signal a mutating Cypher statement. */
const WRITE_KEYWORDS =
    /\b(create|merge|delete|detach|set|remove|drop|call\s+db\.|call\s+apoc\.)\b/i;

/**
 * Return `true` if the Cypher string contains write operations.
 *
 * @param cypher - Cypher statement to check.
 */
function isMutatingCypher(cypher: string): boolean {
    return WRITE_KEYWORDS.test(cypher);
}

/* ── Cypher templates ───────────────────────────────────────────────── */

/**
 * Build a Cypher query for entity lookup.
 *
 * Matches on an exact name first; falls back to case-insensitive
 * `toLower()` comparison for convenience.
 *
 * @param name  - Entity name to find.
 * @param limit - Maximum number of result rows.
 * @returns Cypher query string and parameters.
 */
function buildEntityQuery(
    name: string,
    limit: number
): { cypher: string; parameters: Record<string, unknown> } {
    return {
        cypher:
            'MATCH (e:Entity) ' +
            'WHERE e.name = $name OR toLower(e.name) = toLower($name) ' +
            'OPTIONAL MATCH (e)-[r:RELATES_TO]->(other:Entity) ' +
            'RETURN e.name AS name, e.type AS type, e.description AS description, ' +
            '       collect({ rel: r.type, to: other.name, context: r.context }) AS outgoing ' +
            'LIMIT $limit',
        parameters: { name, limit }
    };
}

/**
 * Build a Cypher query that lists all edges of a given relationship type.
 *
 * @param relationshipType - Relationship type string (e.g. `"uses"`).
 * @param limit            - Maximum number of result rows.
 * @returns Cypher query string and parameters.
 */
function buildRelationshipQuery(
    relationshipType: string,
    limit: number
): { cypher: string; parameters: Record<string, unknown> } {
    return {
        cypher:
            'MATCH (a:Entity)-[r:RELATES_TO]->(b:Entity) ' +
            'WHERE toLower(r.type) = toLower($relationshipType) ' +
            'RETURN a.name AS from, r.type AS relationship, b.name AS to, r.context AS context ' +
            'LIMIT $limit',
        parameters: { relationshipType, limit }
    };
}

/* ── Tool ────────────────────────────────────────────────────────────── */

/**
 * Tool instance for querying the Neo4j knowledge graph.
 *
 * Input:  `{ entity?: string, relationship?: string, cypher?: string, limit?: number }`.
 * Output: `{ rows, rowCount, query, warning? }`.
 */
export const queryKnowledgeGraphTool = createTool({
    id: 'query_knowledge_graph',
    description:
        'Traverse the Neo4j knowledge graph to answer relational questions. ' +
        'Three mutually exclusive modes: ' +
        '(1) entity lookup: { entity: "TypeScript" } — returns the node and all its outgoing edges; ' +
        '(2) relationship listing: { relationship: "uses" } — returns all (from)–[uses]→(to) pairs; ' +
        '(3) raw Cypher: { cypher: "MATCH (a:Entity)-[r]->(b) RETURN a,r,b LIMIT 10" } — read-only. ' +
        'Optional: { limit: 25 } (max 200). ' +
        'Output: { rows: object[], rowCount: number, query: string, warning?: string }. ' +
        'warning is set when Neo4j is unreachable (fail-open: rows will be empty).',
    inputSchema: z.object({
        entity: z.string().optional(),
        relationship: z.string().optional(),
        cypher: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional()
    }),

    /**
     * Execute the graph query in the selected mode.
     *
     * @param input              - Tool input.
     * @param input.entity       - Entity name to look up.
     * @param input.relationship - Relationship type to list.
     * @param input.cypher       - Raw read-only Cypher.
     * @param input.limit        - Maximum rows to return.
     * @returns A typed query result.
     */
    async execute({
        entity,
        relationship,
        cypher: rawCypher,
        limit = 25
    }): Promise<IGraphQueryResult & { warning?: string }> {
        /* ── Availability check ─────────────────────────────────────── */
        const available = await isGraphAvailable();
        if (!available) {
            log.warn('query_knowledge_graph_neo4j_unavailable', {});
            return {
                rows: [],
                rowCount: 0,
                query: rawCypher ?? entity ?? relationship ?? '',
                warning:
                    'Neo4j is not reachable. Start the Neo4j service and retry. ' +
                    'Use `docker compose up neo4j -d` to launch it.'
            };
        }

        /* ── Mode selection ─────────────────────────────────────────── */
        let cypherToRun: string;
        let queryParameters: Record<string, unknown> = {};

        if (entity) {
            /* Mode 1: entity lookup */
            const built = buildEntityQuery(entity, limit);
            cypherToRun = built.cypher;
            queryParameters = built.parameters;
        } else if (relationship) {
            /* Mode 2: relationship listing */
            const built = buildRelationshipQuery(relationship, limit);
            cypherToRun = built.cypher;
            queryParameters = built.parameters;
        } else if (rawCypher) {
            /* Mode 3: raw Cypher — safety check */
            if (isMutatingCypher(rawCypher)) {
                return {
                    rows: [],
                    rowCount: 0,
                    query: rawCypher,
                    warning:
                        'Write operations (CREATE, MERGE, DELETE, SET, REMOVE, DROP) are not ' +
                        'allowed in query_knowledge_graph. Use knowledge_graph tool to ingest data.'
                };
            }
            cypherToRun = rawCypher;
        } else {
            return {
                rows: [],
                rowCount: 0,
                query: '',
                warning: 'Provide at least one of: entity, relationship, or cypher.'
            };
        }

        /* ── Execute ─────────────────────────────────────────────────── */
        const rows = await runCypher(cypherToRun, queryParameters);

        log.info('query_knowledge_graph_done', {
            mode: entity ? 'entity' : relationship ? 'relationship' : 'cypher',
            rowCount: rows.length
        });

        return {
            rows,
            rowCount: rows.length,
            query: cypherToRun
        };
    }
});
