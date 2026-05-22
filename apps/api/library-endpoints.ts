/**
 * Library REST endpoints — PDF ingestion and semantic article search.
 *
 * All routes are fail-open: if Qdrant or Postgres is unavailable the
 * helpers return errors and we respond with 503 so the client can retry.
 *
 * Route table:
 *
 * | Method | Path                          | Action                         |
 * |--------|-------------------------------|--------------------------------|
 * | GET    | /library                      | List all libraries             |
 * | POST   | /library/:libraryId/import    | Import PDFs into a library     |
 * | POST   | /library/:libraryId/search    | Semantic article search        |
 * | GET    | /library/:libraryId/export    | Export article metadata as JSON |
 *
 * @module apps/api/library-endpoints
 */

import type express from 'express';
import { logger } from '@/packages/logger/logger';
import { rejectResponse, successResponse, resolveSafePath } from '@/packages/shared';
import {
    listLibraries,
    getLibrary,
    listArticles,
    countArticles
} from '@/packages/persistence/db';
import { runImport, searchLibrary } from '@/packages/library';
import type { IImportRequest, ISearchRequest, IPdfEntry } from '@/packages/library';

/* ── Validation helpers ──────────────────────────────────────────────── */

/** Library IDs must be lowercase alphanumeric + hyphens, 1–64 chars. */
const LIBRARY_ID_RE = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/;

function isValidLibraryId(value: unknown): value is string {
    return typeof value === 'string' && LIBRARY_ID_RE.test(value);
}

/* ── Route registration ──────────────────────────────────────────────── */

/**
 * Register all `/library` routes on the Express application.
 *
 * @param app - The Express app instance.
 */
export function registerLibraryRoutes(app: express.Express): void {

    /* ── GET /library ────────────────────────────────────────────────── */

    app.get('/library', async (req, res) => {
        logger.info('library_list', { component: 'api.library', requestId: req.requestId });

        const libraries = await listLibraries();
        const data = libraries.map((lib) => ({
            id: lib.id,
            name: lib.name,
            articleCount: lib.articleCount,
            lastImport: lib.lastImportAt?.toISOString() ?? null
        }));

        successResponse(res, data);
    });

    /* ── POST /library/:libraryId/import ─────────────────────────────── */

    app.post('/library/:libraryId/import', async (req, res) => {
        const { libraryId } = req.params;

        if (!isValidLibraryId(libraryId)) {
            rejectResponse(res, 400, 'Bad Request', [
                'libraryId must be lowercase alphanumeric with hyphens (2–64 chars)'
            ]);
            return;
        }

        const body = req.body as Partial<IImportRequest>;

        /* Validate: must provide either pdfs or folder. */
        if (!body.pdfs && !body.folder) {
            rejectResponse(res, 400, 'Bad Request', [
                'Provide either "pdfs" (array) or "folder" (string)'
            ]);
            return;
        }

        logger.info('library_import_start', {
            component: 'api.library',
            libraryId,
            requestId: req.requestId
        });

        /* Build the list of PDF entries from the request. */
        let entries: IPdfEntry[] = [];

        if (Array.isArray(body.pdfs) && body.pdfs.length > 0) {
            /* Validate each PDF entry path. */
            for (const entry of body.pdfs) {
                if (!entry.path || typeof entry.path !== 'string') {
                    rejectResponse(res, 400, 'Bad Request', [
                        'Each PDF entry must have a "path" string'
                    ]);
                    return;
                }
                try {
                    resolveSafePath(entry.path);
                } catch {
                    rejectResponse(res, 400, 'Bad Request', [
                        `Invalid path: ${entry.path}`
                    ]);
                    return;
                }
            }
            entries = body.pdfs;
        } else if (typeof body.folder === 'string') {
            /* Validate the folder path and use the resolved safe path. */
            let safeFolder: string;
            try {
                safeFolder = resolveSafePath(body.folder);
            } catch {
                rejectResponse(res, 400, 'Bad Request', [
                    `Invalid folder path: ${body.folder}`
                ]);
                return;
            }

            /* Discover PDFs recursively in the validated folder. */
            const fs = await import('fs/promises');
            const path = await import('path');

            async function findPdfs(dir: string): Promise<string[]> {
                const results: string[] = [];
                const dirEntries = await fs.readdir(dir, { withFileTypes: true });
                for (const entry of dirEntries) {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        results.push(...(await findPdfs(fullPath)));
                    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
                        results.push(fullPath);
                    }
                }
                return results;
            }

            const pdfPaths = await findPdfs(safeFolder);
            entries = pdfPaths.map((p) => ({ path: p }));

            if (entries.length === 0) {
                rejectResponse(res, 400, 'Bad Request', [
                    `No PDF files found in folder: ${body.folder}`
                ]);
                return;
            }
        }

        /* Parse optional TOC pages from env or library config. */
        const tocPagesEnv = process.env.LIBRARY_TOC_PAGES;
        let tocPages: [number, number] | undefined;
        if (tocPagesEnv) {
            const parts = tocPagesEnv.split(',').map(Number);
            if (parts.length === 2 && parts.every((n) => !Number.isNaN(n))) {
                tocPages = parts as [number, number];
            }
        }

        runImport(libraryId, entries, tocPages)
            .then((result) => successResponse(res, result))
            .catch((error: unknown) => {
                logger.error('library_import_error', {
                    component: 'api.library',
                    libraryId,
                    error: String(error),
                    requestId: req.requestId
                });
                rejectResponse(res, 500, 'Import failed', [String(error)]);
            });
    });

    /* ── POST /library/:libraryId/search ─────────────────────────────── */

    app.post('/library/:libraryId/search', async (req, res) => {
        const { libraryId } = req.params;

        if (!isValidLibraryId(libraryId)) {
            rejectResponse(res, 400, 'Bad Request', [
                'libraryId must be lowercase alphanumeric with hyphens (2–64 chars)'
            ]);
            return;
        }

        const body = req.body as Partial<ISearchRequest>;

        if (!body.query || typeof body.query !== 'string' || !body.query.trim()) {
            rejectResponse(res, 400, 'Bad Request', ['"query" must be a non-empty string']);
            return;
        }

        /* Validate topK if provided. */
        if (body.topK !== undefined) {
            if (typeof body.topK !== 'number' || body.topK < 1 || body.topK > 50) {
                rejectResponse(res, 400, 'Bad Request', ['"topK" must be between 1 and 50']);
                return;
            }
        }

        /* Verify library exists. */
        const library = await getLibrary(libraryId);
        if (library === undefined) {
            rejectResponse(res, 404, 'Not Found', [`Library "${libraryId}" not found`]);
            return;
        }
        if (library === null) {
            rejectResponse(res, 503, 'Service Unavailable', ['Database unavailable']);
            return;
        }

        searchLibrary(libraryId, {
                query: body.query.trim(),
                topK: body.topK,
                filters: body.filters
            })
            .then((results) => {
                /* Strip internal qdrantPointId from response. */
                const data = results.map(({ qdrantPointId: _, ...rest }) => rest);
                successResponse(res, data);
            })
            .catch((error: unknown) => {
                logger.error('library_search_error', {
                    component: 'api.library',
                    libraryId,
                    error: String(error),
                    requestId: req.requestId
                });
                rejectResponse(res, 500, 'Search failed', [String(error)]);
            });
    });

    /* ── GET /library/:libraryId/export ───────────────────────────────── */

    app.get('/library/:libraryId/export', async (req, res) => {
        const { libraryId } = req.params;

        if (!isValidLibraryId(libraryId)) {
            rejectResponse(res, 400, 'Bad Request', [
                'libraryId must be lowercase alphanumeric with hyphens (2–64 chars)'
            ]);
            return;
        }

        /* Verify library exists. */
        const library = await getLibrary(libraryId);
        if (library === undefined) {
            rejectResponse(res, 404, 'Not Found', [`Library "${libraryId}" not found`]);
            return;
        }
        if (library === null) {
            rejectResponse(res, 503, 'Service Unavailable', ['Database unavailable']);
            return;
        }

        const articles = await listArticles(libraryId);

        /* Map to export shape (exclude qdrantPointId). */
        const data = articles.map(({ qdrantPointId: _, libraryId: __, createdAt: ___, ...rest }) => rest);
        successResponse(res, data);
    });
}
