/**
 * Knowledge-graph ingestion tool — extract entities and relationships
 * from a text chunk or document file, then persist them to Neo4j.
 *
 * The tool runs the configured NER model (see `packages/graph/extractor.ts`)
 * against each supplied chunk, then MERGEs entities and relationships
 * into the Neo4j graph as typed `Entity` nodes and `RELATES_TO` edges.
 *
 * **Fail-open**: if Neo4j is unreachable the extraction still runs and
 * the tool returns `{ persisted: false }` without throwing, so agent
 * execution and document ingestion are never blocked.
 *
 * Input:
 * - `text`       — raw text to analyse (mutually exclusive with `path`).
 * - `path`       — path to a file; text will be read via `read_file`.
 * - `sourcePath` — optional provenance label stored on MENTIONS edges.
 *
 * Output: `{ entitiesMerged, relationshipsMerged, persisted }`.
 *
 * @module tools/knowledge.graph
 */

import { z } from 'zod';
import { createTool } from './tool-builder';
import { extractEntitiesAndRelationships } from '../graph/extractor';
import { runCypher, isGraphAvailable, ensureConstraints } from '../graph/client';
import { resolveSafePath } from '../shared/path-safety';
import { logger } from '../logger/logger';
import type { IGraphEntity, IGraphRelationship, IKnowledgeGraphIngestResult } from '../graph/types';
import fs from 'fs/promises';

/* ── Neo4j Cypher helpers ───────────────────────────────────────────── */

/**
 * MERGE a single entity node into the graph.
 *
 * Uses `MERGE` so duplicate ingestion is idempotent — the same entity
 * extracted from multiple documents produces exactly one node.
 *
 * @param entity - The entity to persist.
 */
async function mergeEntity(entity: IGraphEntity): Promise<void> {
    await runCypher(
        `MERGE (e:Entity { name: $name, type: $type })
         ON CREATE SET e.description = $description, e.createdAt = timestamp()
         ON MATCH  SET e.description = coalesce($description, e.description)`,
        {
            name: entity.name,
            type: entity.type,
            description: entity.description ?? null
        }
    );
}

/**
 * MERGE a directed `RELATES_TO` edge between two entities.
 *
 * Both endpoint entities are MERGE'd first to ensure referential
 * integrity even when only partial sub-graphs are supplied.
 *
 * @param relationship - The relationship to persist.
 * @param sourcePath   - Optional provenance label for the edge.
 */
async function mergeRelationship(
    relationship: IGraphRelationship,
    sourcePath?: string
): Promise<void> {
    await runCypher(
        `MERGE (a:Entity { name: $from })
         MERGE (b:Entity { name: $to })
         MERGE (a)-[r:RELATES_TO { type: $type }]->(b)
         ON CREATE SET r.context  = $context,
                       r.source   = $source,
                       r.createdAt = timestamp()`,
        {
            from: relationship.from,
            to: relationship.to,
            type: relationship.type,
            context: relationship.context ?? null,
            source: sourcePath ?? null
        }
    );
}

/* ── Tool ─────────────────────────────────────────────────────────────── */

/**
 * Tool instance for ingesting text (or a file) into the knowledge graph.
 *
 * Input:  `{ text?: string, path?: string, sourcePath?: string }`.
 * Output: `{ entitiesMerged, relationshipsMerged, persisted }`.
 */
export const knowledgeGraphTool = createTool({
    id: 'knowledge_graph',
    description:
        'Extract entities and relationships from text (or a file) and persist them to the Neo4j ' +
        'knowledge graph. Input: { text?: string, path?: string, sourcePath?: string }. ' +
        'Provide either "text" (raw content) or "path" (relative file path), not both. ' +
        '"sourcePath" is an optional provenance label stored on relationship edges. ' +
        'Output: { entitiesMerged: number, relationshipsMerged: number, persisted: boolean }. ' +
        'persisted=false means Neo4j was unreachable; extraction ran but data was not saved.',
    inputSchema: z.object({
        text: z.string().optional(),
        path: z.string().optional(),
        sourcePath: z.string().optional()
    }),

    /**
     * Execute the knowledge-graph ingestion pipeline:
     * 1. Resolve text from `text` or `path`.
     * 2. Extract entities + relationships via Ollama NER.
     * 3. MERGE all nodes and edges into Neo4j (fail-open).
     *
     * @param input            - Tool input.
     * @param input.text       - Raw text to analyse.
     * @param input.path       - File path to read and analyse.
     * @param input.sourcePath - Provenance label for edges.
     * @returns Ingestion summary.
     */
    async execute({ text, path: filePath, sourcePath }): Promise<IKnowledgeGraphIngestResult> {
        /* 1. Resolve input text ---------------------------------------- */
        let content: string;

        if (text && text.trim()) {
            content = text;
        } else if (filePath) {
            const safePath = resolveSafePath(filePath);
            content = await fs.readFile(safePath, 'utf8');
        } else {
            logger.warn('knowledge_graph_no_input', { component: 'tools.knowledge_graph' });
            return { entitiesMerged: 0, relationshipsMerged: 0, persisted: false };
        }

        /* 2. Extract entities and relationships ----------------------- */
        const extraction = await extractEntitiesAndRelationships(content);

        if (extraction.entities.length === 0 && extraction.relationships.length === 0) {
            logger.info('knowledge_graph_empty_extraction', {
                component: 'tools.knowledge_graph',
                contentLength: content.length
            });
            return { entitiesMerged: 0, relationshipsMerged: 0, persisted: false };
        }

        /* 3. Persist to Neo4j (fail-open) ----------------------------- */
        const available = await isGraphAvailable();
        if (!available) {
            logger.warn('knowledge_graph_neo4j_unavailable', {
                component: 'tools.knowledge_graph',
                entities: extraction.entities.length,
                relationships: extraction.relationships.length
            });
            return {
                entitiesMerged: extraction.entities.length,
                relationshipsMerged: extraction.relationships.length,
                persisted: false
            };
        }

        /* Ensure schema constraints exist (idempotent). */
        await ensureConstraints();

        /* Merge entities. */
        for (const entity of extraction.entities) {
            await mergeEntity(entity);
        }

        /* Merge relationships. */
        for (const relationship of extraction.relationships) {
            await mergeRelationship(relationship, sourcePath);
        }

        logger.info('knowledge_graph_ingest_done', {
            component: 'tools.knowledge_graph',
            entitiesMerged: extraction.entities.length,
            relationshipsMerged: extraction.relationships.length,
            source: sourcePath ?? null
        });

        return {
            entitiesMerged: extraction.entities.length,
            relationshipsMerged: extraction.relationships.length,
            persisted: true
        };
    }
});
