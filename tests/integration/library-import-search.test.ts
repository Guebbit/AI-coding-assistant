/**
 * Integration tests for library import + retrieval flow.
 *
 * Verifies a document imported through `/library/:libraryId/import`
 * can be retrieved through `/library/:libraryId/search`.
 */

import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface IStoredArticle {
    id: string;
    title: string;
    summary: string;
    topics: string[];
    year: number | null;
    month: string | null;
    startPage: number | null;
    endPage: number | null;
    pdfPath: string;
    qdrantPointId: string;
    score?: number;
}

const libraries = new Map([
    [
        'test-lib',
        {
            id: 'test-lib',
            name: 'Test Library',
            articleCount: 0,
            lastImportAt: null,
            config: {},
            createdAt: new Date('2026-01-01T00:00:00.000Z')
        }
    ]
]);
const articlesByLibrary = new Map<string, IStoredArticle[]>();
let articleCounter = 0;

vi.mock('@/packages/logger/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

vi.mock('@/packages/shared', async (importOriginal) => {
    const original = await importOriginal<typeof import('@/packages/shared')>();
    return {
        ...original,
        resolveSafePath: vi.fn((p: string) => {
            if (p.includes('..') || p.includes('\0')) throw new Error('Unsafe path');
            return p;
        })
    };
});

vi.mock('@/packages/persistence/db', () => ({
    listLibraries: vi.fn(async () => [...libraries.values()]),
    getLibrary: vi.fn(async (libraryId: string) => libraries.get(libraryId)),
    listArticles: vi.fn(async (libraryId: string) => articlesByLibrary.get(libraryId) ?? []),
    countArticles: vi.fn(
        async (libraryId: string) => (articlesByLibrary.get(libraryId) ?? []).length
    )
}));

vi.mock('@/packages/library', () => ({
    runImport: vi.fn(async (libraryId: string, entries: Array<{ path: string }>) => {
        const library = libraries.get(libraryId);
        if (!library) {
            throw new Error(`Library "${libraryId}" not found`);
        }

        const target = articlesByLibrary.get(libraryId) ?? [];
        for (const entry of entries) {
            articleCounter += 1;
            target.push({
                id: `article-${articleCounter}`,
                title: `Imported article ${articleCounter}`,
                summary: 'A short imported summary for retrieval checks.',
                topics: ['testing', 'library'],
                year: 2026,
                month: 'May',
                startPage: 1,
                endPage: 3,
                pdfPath: entry.path,
                qdrantPointId: `qdrant-${articleCounter}`
            });
        }

        articlesByLibrary.set(libraryId, target);
        library.articleCount = target.length;
        library.lastImportAt = new Date('2026-05-01T00:00:00.000Z');

        return {
            imported: entries.length,
            skipped: 0,
            errors: []
        };
    }),
    searchLibrary: vi.fn(async (libraryId: string, request: { query: string; topK?: number }) => {
        const articles = articlesByLibrary.get(libraryId) ?? [];
        const normalizedQuery = request.query.toLowerCase();
        const matched = articles.filter(
            (article) =>
                article.title.toLowerCase().includes(normalizedQuery) ||
                article.summary.toLowerCase().includes(normalizedQuery)
        );
        return matched.slice(0, request.topK ?? 10).map((article) => ({
            ...article,
            score: article.score ?? 0.99
        }));
    })
}));

import { registerLibraryRoutes } from '@/apps/api/library-endpoints';

async function startServer(): Promise<{ server: Server; baseUrl: string }> {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        req.requestId = 'library-flow-request-id';
        next();
    });
    registerLibraryRoutes(app);

    const server = await new Promise<Server>((resolve) => {
        const instance = app.listen(0, () => resolve(instance));
    });

    return {
        server,
        baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    };
}

describe('library import + search flow', () => {
    beforeEach(() => {
        articleCounter = 0;
        articlesByLibrary.clear();
        const library = libraries.get('test-lib');
        if (library) {
            library.articleCount = 0;
            library.lastImportAt = null;
        }
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('imports a document and retrieves it via search', async () => {
        const { server, baseUrl } = await startServer();

        try {
            const importResponse = await fetch(`${baseUrl}/library/test-lib/import`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pdfs: [{ path: '/storage/library/2026/05/test-article.pdf' }]
                })
            });
            const importBody = (await importResponse.json()) as {
                success: boolean;
                data: { imported: number; skipped: number; errors: string[] };
            };

            expect(importResponse.status).toBe(200);
            expect(importBody.success).toBe(true);
            expect(importBody.data).toMatchObject({ imported: 1, skipped: 0, errors: [] });

            const searchResponse = await fetch(`${baseUrl}/library/test-lib/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: 'imported article', topK: 5 })
            });
            const searchBody = (await searchResponse.json()) as {
                success: boolean;
                data: Array<{
                    id: string;
                    title: string;
                    summary: string;
                    pdfPath: string;
                    score: number;
                    qdrantPointId?: string;
                }>;
            };

            expect(searchResponse.status).toBe(200);
            expect(searchBody.success).toBe(true);
            expect(searchBody.data).toHaveLength(1);
            expect(searchBody.data[0]).toMatchObject({
                title: 'Imported article 1',
                pdfPath: '/storage/library/2026/05/test-article.pdf'
            });
            expect(typeof searchBody.data[0].score).toBe('number');
            expect(searchBody.data[0].qdrantPointId).toBeUndefined();
        } finally {
            await new Promise<void>((resolve, reject) => {
                server.close((error) => (error ? reject(error) : resolve()));
            });
        }
    });
});
