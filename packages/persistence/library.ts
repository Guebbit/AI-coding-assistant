/**
 * Library persistence — CRUD for libraries and their articles.
 *
 * WHY: Isolates library-specific SQL from the rest (SRP).
 * Libraries hold articles; articles link to Qdrant vectors for search.
 *
 * @module persistence/library
 */

import { withClient } from './pool';
import type {
    ILibraryRecord,
    IUpsertLibraryInput,
    ILibraryArticleRecord,
    ICreateArticleInput
} from './types';

/* ── Column projections (DRY SQL aliases) ────────────────────────────────── */

/** Row-level projection helper for libraries. */
const LIBRARY_COLS = `
    id, name, config,
    article_count AS "articleCount",
    last_import_at AS "lastImportAt",
    created_at AS "createdAt"`;

/** Row-level projection helper for library articles. */
const ARTICLE_COLS = `
    id,
    library_id AS "libraryId",
    title, summary, topics,
    year, month,
    start_page AS "startPage",
    end_page AS "endPage",
    pdf_path AS "pdfPath",
    pdf_page_offset AS "pdfPageOffset",
    qdrant_point_id AS "qdrantPointId",
    created_at AS "createdAt"`;

/* ── Libraries ───────────────────────────────────────────────────────────── */

/**
 * List all libraries, newest first.
 */
export async function listLibraries(): Promise<ILibraryRecord[]> {
    const result = (await withClient((client) =>
        client.query<ILibraryRecord>(
            `SELECT ${LIBRARY_COLS} FROM libraries ORDER BY created_at DESC`
        )
    )) as { rows: ILibraryRecord[] } | null;
    return result?.rows ?? [];
}

/**
 * Get a single library by ID.
 * Returns `null` on DB error, `undefined` when not found.
 */
export async function getLibrary(id: string): Promise<ILibraryRecord | null | undefined> {
    return withClient(async (client) => {
        const { rows } = await client.query<ILibraryRecord>(
            `SELECT ${LIBRARY_COLS} FROM libraries WHERE id = $1`,
            [id]
        );
        return rows[0] ?? undefined;
    });
}

/**
 * Create or update a library (upsert by ID).
 */
export async function upsertLibrary(input: IUpsertLibraryInput): Promise<ILibraryRecord | null> {
    return withClient(async (client) => {
        const { rows } = await client.query<ILibraryRecord>(
            `INSERT INTO libraries (id, name, config)
             VALUES ($1, $2, $3)
             ON CONFLICT (id) DO UPDATE SET
                 name = EXCLUDED.name,
                 config = EXCLUDED.config
             RETURNING ${LIBRARY_COLS}`,
            [input.id, input.name, JSON.stringify(input.config ?? {})]
        );
        return rows[0];
    });
}

/**
 * Update the article_count and last_import_at for a library.
 */
export async function updateLibraryStats(libraryId: string, articleCount: number): Promise<void> {
    await withClient(async (client) => {
        await client.query(
            `UPDATE libraries SET article_count = $1, last_import_at = NOW() WHERE id = $2`,
            [articleCount, libraryId]
        );
    });
}

/* ── Articles ────────────────────────────────────────────────────────────── */

/**
 * Insert an article into a library. Skips duplicates (idempotent).
 * Returns the article record, or `null` on DB error / duplicate.
 */
export async function createArticle(
    input: ICreateArticleInput
): Promise<ILibraryArticleRecord | null> {
    return withClient(async (client) => {
        const { rows } = await client.query<ILibraryArticleRecord>(
            `INSERT INTO library_articles
                (library_id, title, summary, topics, year, month,
                 start_page, end_page, pdf_path, pdf_page_offset, qdrant_point_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             ON CONFLICT (library_id, title, year, month, start_page) DO NOTHING
             RETURNING ${ARTICLE_COLS}`,
            [
                input.libraryId,
                input.title,
                input.summary,
                JSON.stringify(input.topics),
                input.year ?? null,
                input.month ?? null,
                input.startPage,
                input.endPage ?? null,
                input.pdfPath,
                input.pdfPageOffset ?? 0,
                input.qdrantPointId
            ]
        );
        return rows[0] ?? null;
    });
}

/**
 * Get all articles for a library (for export). No embeddings.
 */
export async function listArticles(libraryId: string): Promise<ILibraryArticleRecord[]> {
    const result = (await withClient((client) =>
        client.query<ILibraryArticleRecord>(
            `SELECT ${ARTICLE_COLS} FROM library_articles
             WHERE library_id = $1
             ORDER BY year DESC, month, start_page ASC`,
            [libraryId]
        )
    )) as { rows: ILibraryArticleRecord[] } | null;
    return result?.rows ?? [];
}

/**
 * Count articles in a library.
 */
export async function countArticles(libraryId: string): Promise<number> {
    const result = (await withClient((client) =>
        client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count FROM library_articles WHERE library_id = $1`,
            [libraryId]
        )
    )) as { rows: { count: string }[] } | null;
    return Number.parseInt(result?.rows[0]?.count ?? '0', 10);
}
