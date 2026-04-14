/**
 * Shared types for the Manna knowledge graph layer.
 *
 * Defines the entity/relationship schema stored in Neo4j, plus the
 * data-transfer objects returned by the extractor and the query tool.
 *
 * @module graph/types
 */

/* ── Entity schema ──────────────────────────────────────────────────── */

/**
 * The recognised entity types that the NER extractor can label.
 *
 * - `Person`       — a named individual (real or fictional)
 * - `Organization` — a company, group, institution, or team
 * - `Concept`      — an abstract idea, principle, or theme
 * - `Technology`   — a software tool, language, framework, or protocol
 * - `Location`     — a geographic or virtual place
 * - `Document`     — a file, article, specification, or other artefact
 * - `Topic`        — a high-level subject area or domain
 * - `Other`        — anything that does not fit the above categories
 */
export type EntityType =
    | 'Person'
    | 'Organization'
    | 'Concept'
    | 'Technology'
    | 'Location'
    | 'Document'
    | 'Topic'
    | 'Other';

/**
 * A single entity node extracted from a text chunk.
 *
 * Used both as the return value from the extractor and as the
 * canonical shape stored in Neo4j (as `n.name`, `n.type`, etc.).
 */
export interface IGraphEntity {
    /** Normalised name of the entity (e.g. `"TypeScript"`, `"Alan Turing"`). */
    name: string;

    /** Semantic category of the entity. */
    type: EntityType;

    /**
     * Optional short description inferred from context.
     *
     * Example: `"statically typed superset of JavaScript"`.
     */
    description?: string;
}

/**
 * A directed relationship between two entities.
 *
 * Stored in Neo4j as an edge labelled `RELATES_TO` with properties
 * that carry the semantic relationship type.
 */
export interface IGraphRelationship {
    /** Name of the source entity (must match an `IGraphEntity.name`). */
    from: string;

    /** Name of the target entity (must match an `IGraphEntity.name`). */
    to: string;

    /**
     * Human-readable relationship label (e.g. `"uses"`, `"authored_by"`,
     * `"part_of"`, `"related_to"`).
     */
    type: string;

    /**
     * Optional sentence or phrase from the source text that evidences
     * this relationship.
     */
    context?: string;
}

/**
 * The structured output produced by the NER extractor for a single
 * text chunk.
 */
export interface IExtractionResult {
    /** All entities found in the text. */
    entities: IGraphEntity[];

    /** All directed relationships found between those entities. */
    relationships: IGraphRelationship[];
}

/* ── Query result ───────────────────────────────────────────────────── */

/**
 * A single row returned by the `query_knowledge_graph` tool.
 *
 * Each row is a key-value map produced by a Cypher RETURN clause.
 * The values can be Neo4j primitives (string, number, boolean) or
 * nested objects for node/relationship properties.
 */
export type GraphQueryRow = Record<string, unknown>;

/**
 * The typed result returned by the `query_knowledge_graph` tool.
 */
export interface IGraphQueryResult {
    /**
     * Array of result rows (one per Cypher RETURN tuple).
     * Empty when no matches are found.
     */
    rows: GraphQueryRow[];

    /** Number of rows returned. */
    rowCount: number;

    /** The Cypher query that was executed (after any template expansion). */
    query: string;
}

/* ── Ingestion result ───────────────────────────────────────────────── */

/**
 * The typed result returned by the `knowledge_graph` ingestion tool.
 */
export interface IKnowledgeGraphIngestResult {
    /** Number of entity nodes merged into the graph. */
    entitiesMerged: number;

    /** Number of relationship edges merged into the graph. */
    relationshipsMerged: number;

    /**
     * Whether Neo4j was actually reachable and the write succeeded.
     *
     * `false` means the tool ran in fail-open mode (Neo4j unavailable);
     * extraction results were computed but not persisted.
     */
    persisted: boolean;
}
