/**
 * Unit tests for apps/api/library-endpoints.ts
 *
 * Tests the HTTP route validation logic (libraryId format, request body
 * validation, error responses) by mocking DB/search dependencies.
 * Uses a minimal Express server + native fetch (same pattern as chat-api.test.ts).
 */

import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* ── Mock all heavy dependencies ────────────────────────────────────── */

vi.mock('@/packages/persistence/database', () => ({
    listLibraries: vi.fn(),
    getLibrary: vi.fn(),
    listArticles: vi.fn(),
    countArticles: vi.fn()
}));

vi.mock('@/packages/library', () => ({
    runImport: vi.fn(),
    searchLibrary: vi.fn()
}));

vi.mock('@/packages/shared', async (importOriginal) => {
    const original = await importOriginal<typeof import('@/packages/shared')>();
    return {
        ...original,
        // resolveSafePath: reject traversal paths, pass others through
        resolveSafePath: vi.fn((p: string) => {
            if (p.includes('..') || p.includes('\0')) throw new Error('Unsafe path');
            return p;
        })
    };
});

vi.mock('@/packages/logger/logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn()
    }
}));

/* ── Import mocks + module under test ──────────────────────────────── */

import { listLibraries, getLibrary, listArticles } from '@/packages/persistence/database';
import { runImport, searchLibrary } from '@/packages/library';
import { registerLibraryRoutes } from '@/apps/api/library-endpoints';

/* ── Test server setup ─────────────────────────────────────────────── */

let server: Server;
let baseUrl: string;

function createTestApp(): express.Express {
    const app = express();
    app.use(express.json());
    // Simulate requestId middleware
    app.use((req, _res, next) => {
        (req as express.Request & { requestId: string }).requestId = 'test-req-id';
        next();
    });
    registerLibraryRoutes(app);
    return app;
}

/* ── Tests ─────────────────────────────────────────────────────────── */

describe('library-endpoints', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        const app = createTestApp();
        server = app.listen(0);
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
    });

    afterEach(() => {
        server?.close();
    });

    describe('GET /library', () => {
        it('returns list of libraries', async () => {
            vi.mocked(listLibraries).mockResolvedValue([
                {
                    id: 'sci-am',
                    name: 'Scientific American',
                    articleCount: 42,
                    lastImportAt: new Date('2026-04-01T00:00:00Z'),
                    config: {},
                    createdAt: new Date()
                }
            ] as never);

            const res = await fetch(`${baseUrl}/library`);
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(body.success).toBe(true);
            expect(body.data).toHaveLength(1);
            expect(body.data[0].id).toBe('sci-am');
            expect(body.data[0].articleCount).toBe(42);
        });

        it('returns empty array when no libraries exist', async () => {
            vi.mocked(listLibraries).mockResolvedValue([]);

            const res = await fetch(`${baseUrl}/library`);
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(body.data).toEqual([]);
        });
    });

    describe('POST /library/:libraryId/import', () => {
        it('rejects invalid library IDs', async () => {
            const res = await fetch(`${baseUrl}/library/INVALID_ID!/import`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pdfs: [{ path: '/test.pdf' }] })
            });

            expect(res.status).toBe(400);
            const body = await res.json();
            expect(body.success).toBe(false);
        });

        it('rejects single-char library IDs', async () => {
            const res = await fetch(`${baseUrl}/library/x/import`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pdfs: [{ path: '/test.pdf' }] })
            });

            expect(res.status).toBe(400);
        });

        it('rejects requests without pdfs or folder', async () => {
            const res = await fetch(`${baseUrl}/library/valid-lib/import`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            const body = await res.json();

            expect(res.status).toBe(400);
            expect(body.errors[0]).toContain('pdfs');
        });

        it('rejects PDF entries without path', async () => {
            const res = await fetch(`${baseUrl}/library/valid-lib/import`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pdfs: [{ year: 2026 }] })
            });

            expect(res.status).toBe(400);
        });

        it('rejects unsafe paths (directory traversal)', async () => {
            const res = await fetch(`${baseUrl}/library/valid-lib/import`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pdfs: [{ path: '/../../../etc/passwd' }] })
            });
            const body = await res.json();

            expect(res.status).toBe(400);
            expect(body.errors[0]).toContain('Invalid path');
        });

        it('calls runImport with valid input and returns result', async () => {
            vi.mocked(runImport).mockResolvedValue({
                imported: 5,
                skipped: 1,
                errors: []
            });

            const res = await fetch(`${baseUrl}/library/valid-lib/import`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pdfs: [{ path: '/storage/sa/2026/03.pdf' }] })
            });
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(body.data.imported).toBe(5);
            expect(runImport).toHaveBeenCalledWith(
                'valid-lib',
                [{ path: '/storage/sa/2026/03.pdf' }],
                undefined
            );
        });

        it('returns 500 when import throws', async () => {
            vi.mocked(runImport).mockRejectedValue(new Error('Qdrant connection refused'));

            const res = await fetch(`${baseUrl}/library/valid-lib/import`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pdfs: [{ path: '/storage/test.pdf' }] })
            });

            expect(res.status).toBe(500);
        });
    });

    describe('POST /library/:libraryId/search', () => {
        it('rejects empty query', async () => {
            const res = await fetch(`${baseUrl}/library/test-lib/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: '' })
            });

            expect(res.status).toBe(400);
        });

        it('rejects missing query field', async () => {
            const res = await fetch(`${baseUrl}/library/test-lib/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });

            expect(res.status).toBe(400);
        });

        it('rejects topK out of range', async () => {
            vi.mocked(getLibrary).mockResolvedValue({
                id: 'test-lib',
                name: 'Test',
                articleCount: 10,
                lastImportAt: null,
                config: {},
                createdAt: new Date()
            } as never);

            const res = await fetch(`${baseUrl}/library/test-lib/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: 'test', topK: 100 })
            });
            const body = await res.json();

            expect(res.status).toBe(400);
            expect(body.errors[0]).toContain('topK');
        });

        it('returns 404 when library does not exist', async () => {
            vi.mocked(getLibrary).mockResolvedValue(undefined);

            const res = await fetch(`${baseUrl}/library/nonexistent-lib/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: 'test' })
            });

            expect(res.status).toBe(404);
        });

        it('returns 503 when DB is unavailable', async () => {
            vi.mocked(getLibrary).mockResolvedValue(null);

            const res = await fetch(`${baseUrl}/library/test-lib/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: 'test' })
            });

            expect(res.status).toBe(503);
        });

        it('returns search results without qdrantPointId', async () => {
            vi.mocked(getLibrary).mockResolvedValue({
                id: 'test-lib',
                name: 'Test',
                articleCount: 10,
                lastImportAt: null,
                config: {},
                createdAt: new Date()
            } as never);
            vi.mocked(searchLibrary).mockResolvedValue([
                {
                    id: 'article-1',
                    score: 0.92,
                    title: 'AI Research',
                    summary: 'About AI',
                    topics: ['AI'],
                    year: 2026,
                    month: 'March',
                    startPage: 12,
                    endPage: 20,
                    pdfPath: '/storage/test.pdf',
                    qdrantPointId: 'secret-internal-id'
                }
            ]);

            const res = await fetch(`${baseUrl}/library/test-lib/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: 'artificial intelligence' })
            });
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(body.data[0].title).toBe('AI Research');
            expect(body.data[0].score).toBe(0.92);
            // qdrantPointId should be stripped from response
            expect(body.data[0].qdrantPointId).toBeUndefined();
        });
    });

    describe('GET /library/:libraryId/export', () => {
        it('returns 404 when library does not exist', async () => {
            vi.mocked(getLibrary).mockResolvedValue(undefined);

            const res = await fetch(`${baseUrl}/library/ghost-lib/export`);

            expect(res.status).toBe(404);
        });

        it('returns exported articles without internal fields', async () => {
            vi.mocked(getLibrary).mockResolvedValue({
                id: 'test-lib',
                name: 'Test',
                articleCount: 1,
                lastImportAt: null,
                config: {},
                createdAt: new Date()
            } as never);
            vi.mocked(listArticles).mockResolvedValue([
                {
                    id: 'art-1',
                    libraryId: 'test-lib',
                    title: 'Exported Article',
                    summary: 'Summary here',
                    topics: ['science'],
                    year: 2026,
                    month: 'April',
                    startPage: 5,
                    endPage: 10,
                    pdfPath: '/storage/test.pdf',
                    pdfPageOffset: 0,
                    qdrantPointId: 'internal-id',
                    createdAt: new Date('2026-04-01')
                }
            ] as never);

            const res = await fetch(`${baseUrl}/library/test-lib/export`);
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(body.data).toHaveLength(1);
            expect(body.data[0].title).toBe('Exported Article');
            // Internal fields stripped
            expect(body.data[0].qdrantPointId).toBeUndefined();
            expect(body.data[0].libraryId).toBeUndefined();
            expect(body.data[0].createdAt).toBeUndefined();
        });
    });
});
