/**
 * Unit tests for packages/library/ingestion.ts
 *
 * Mocks all external dependencies (LLM, PDF extraction, DB, Qdrant)
 * to test the two-pass pipeline logic without touching real infrastructure.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

/* ── Mock all external modules BEFORE importing the module under test ── */

// Mock LLM (ollama generate)
vi.mock('@/packages/llm/ollama', () => ({
    generate: vi.fn()
}));

// Mock LLM embeddings
vi.mock('@/packages/llm/embeddings', () => ({
    getEmbedding: vi.fn()
}));

// Mock persistence DB functions
vi.mock('@/packages/persistence/database', () => ({
    upsertLibrary: vi.fn().mockResolvedValue({ id: 'test-lib', name: 'Test Lib' }),
    createArticle: vi.fn().mockResolvedValue({ id: 'article-1' }),
    updateLibraryStats: vi.fn().mockResolvedValue(undefined),
    countArticles: vi.fn().mockResolvedValue(3)
}));

// Mock Qdrant library-store
vi.mock('@/packages/library/library-store', () => ({
    ensureCollection: vi.fn().mockResolvedValue(undefined),
    upsertPoint: vi.fn().mockResolvedValue(undefined)
}));

// Mock PDF extraction
vi.mock('@/packages/library/pdf-extraction', () => ({
    extractPageRange: vi.fn()
}));

// Mock logger (suppress output)
vi.mock('@/packages/logger/logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn()
    }
}));

/* ── Import mocked modules + module under test ─────────────────────── */

import { generate } from '@/packages/llm/ollama';
import { getEmbedding } from '@/packages/llm/embeddings';
import {
    upsertLibrary,
    createArticle,
    updateLibraryStats,
    countArticles
} from '@/packages/persistence/database';
import { ensureCollection, upsertPoint } from '@/packages/library/library-store';
import { extractPageRange } from '@/packages/library/pdf-extraction';
import { discoverStructure, importPdf, runImport } from '@/packages/library/ingestion';

/* ── Test data ─────────────────────────────────────────────────────── */

const MOCK_TOC_TEXT = `
Contents
The Future of AI ............... 12
Ocean Exploration Today ........ 24
Climate Solutions .............. 38
`;

const MOCK_ARTICLE_STUBS = [
    { title: 'The Future of AI', startPage: 12, endPage: 23 },
    { title: 'Ocean Exploration Today', startPage: 24, endPage: 37 },
    { title: 'Climate Solutions', startPage: 38, endPage: null }
];

const MOCK_ARTICLE_SUMMARY = {
    summary:
        'This article discusses advances in artificial intelligence and its impact on society.',
    topics: ['AI', 'technology', 'future']
};

const MOCK_EMBEDDING = Array.from({ length: 768 }, (_, i) => Math.sin(i * 0.1));

/* ── Tests ─────────────────────────────────────────────────────────── */

describe('library/ingestion', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('discoverStructure (Pass 1)', () => {
        it('extracts article stubs from TOC text via LLM', async () => {
            // Mock: PDF extraction returns TOC text
            vi.mocked(extractPageRange).mockResolvedValue(MOCK_TOC_TEXT);
            // Mock: LLM returns JSON array of stubs
            vi.mocked(generate).mockResolvedValue(JSON.stringify(MOCK_ARTICLE_STUBS));

            const stubs = await discoverStructure('/storage/sa/2026/03.pdf', [1, 4]);

            expect(extractPageRange).toHaveBeenCalledWith('/storage/sa/2026/03.pdf', 1, 4);
            expect(generate).toHaveBeenCalledTimes(1);
            expect(stubs).toHaveLength(3);
            expect(stubs[0].title).toBe('The Future of AI');
            expect(stubs[0].startPage).toBe(12);
            expect(stubs[2].endPage).toBeNull();
        });

        it('returns empty array when TOC text is empty', async () => {
            vi.mocked(extractPageRange).mockResolvedValue('');

            const stubs = await discoverStructure('/storage/sa/2026/03.pdf');

            expect(stubs).toEqual([]);
            expect(generate).not.toHaveBeenCalled();
        });

        it('returns empty array when LLM returns invalid JSON', async () => {
            vi.mocked(extractPageRange).mockResolvedValue(MOCK_TOC_TEXT);
            vi.mocked(generate).mockResolvedValue('not valid json at all');

            const stubs = await discoverStructure('/storage/sa/2026/03.pdf');

            expect(stubs).toEqual([]);
        });

        it('filters out stubs missing required fields', async () => {
            vi.mocked(extractPageRange).mockResolvedValue(MOCK_TOC_TEXT);
            vi.mocked(generate).mockResolvedValue(
                JSON.stringify([
                    { title: 'Good', startPage: 5, endPage: 10 },
                    { title: null, startPage: 15, endPage: 20 }, // invalid title
                    { title: 'No Page', startPage: 'abc', endPage: null } // invalid startPage
                ])
            );

            const stubs = await discoverStructure('/storage/sa/2026/03.pdf');

            expect(stubs).toHaveLength(1);
            expect(stubs[0].title).toBe('Good');
        });
    });

    describe('importPdf', () => {
        it('processes a single PDF through both passes and stores results', async () => {
            // Pass 1: structure discovery
            vi.mocked(extractPageRange).mockResolvedValueOnce(MOCK_TOC_TEXT);
            vi.mocked(generate).mockResolvedValueOnce(JSON.stringify(MOCK_ARTICLE_STUBS));

            // Pass 2: content extraction (called for each article)
            vi.mocked(extractPageRange).mockResolvedValue('Article text content here...');
            vi.mocked(generate).mockResolvedValue(JSON.stringify(MOCK_ARTICLE_SUMMARY));
            vi.mocked(getEmbedding).mockResolvedValue(MOCK_EMBEDDING);

            const count = await importPdf('test-lib', { path: '/storage/sa/2026/03.pdf' });

            // Should have imported 3 articles
            expect(count).toBe(3);
            // Qdrant upserts for each article
            expect(upsertPoint).toHaveBeenCalledTimes(3);
            // DB inserts for each article
            expect(createArticle).toHaveBeenCalledTimes(3);
        });

        it('infers year and month from file path', async () => {
            vi.mocked(extractPageRange).mockResolvedValueOnce(MOCK_TOC_TEXT);
            vi.mocked(generate).mockResolvedValueOnce(
                JSON.stringify([{ title: 'Test', startPage: 1, endPage: 5 }])
            );
            vi.mocked(extractPageRange).mockResolvedValue('content');
            vi.mocked(generate).mockResolvedValue(JSON.stringify(MOCK_ARTICLE_SUMMARY));
            vi.mocked(getEmbedding).mockResolvedValue(MOCK_EMBEDDING);

            await importPdf('test-lib', { path: '/storage/sa/2026/03.pdf' });

            // Should have passed inferred year=2026, month=March to createArticle
            expect(createArticle).toHaveBeenCalledWith(
                expect.objectContaining({
                    year: 2026,
                    month: 'March'
                })
            );
        });

        it('uses explicit year/month from entry when provided', async () => {
            vi.mocked(extractPageRange).mockResolvedValueOnce(MOCK_TOC_TEXT);
            vi.mocked(generate).mockResolvedValueOnce(
                JSON.stringify([{ title: 'Test', startPage: 1, endPage: 5 }])
            );
            vi.mocked(extractPageRange).mockResolvedValue('content');
            vi.mocked(generate).mockResolvedValue(JSON.stringify(MOCK_ARTICLE_SUMMARY));
            vi.mocked(getEmbedding).mockResolvedValue(MOCK_EMBEDDING);

            await importPdf('test-lib', {
                path: '/storage/sa/2026/03.pdf',
                year: 2025,
                month: 'December'
            });

            expect(createArticle).toHaveBeenCalledWith(
                expect.objectContaining({
                    year: 2025,
                    month: 'December'
                })
            );
        });

        it('returns 0 when no articles found in TOC', async () => {
            vi.mocked(extractPageRange).mockResolvedValue('');

            const count = await importPdf('test-lib', { path: '/storage/empty.pdf' });

            expect(count).toBe(0);
            expect(upsertPoint).not.toHaveBeenCalled();
            expect(createArticle).not.toHaveBeenCalled();
        });

        it('continues processing when one article fails', async () => {
            // Setup: 2 articles in TOC
            vi.mocked(extractPageRange).mockResolvedValueOnce(MOCK_TOC_TEXT);
            vi.mocked(generate).mockResolvedValueOnce(
                JSON.stringify([
                    { title: 'Article 1', startPage: 1, endPage: 10 },
                    { title: 'Article 2', startPage: 11, endPage: 20 }
                ])
            );

            // First article succeeds, second fails
            vi.mocked(extractPageRange).mockResolvedValueOnce('content 1');
            vi.mocked(generate).mockResolvedValueOnce(JSON.stringify(MOCK_ARTICLE_SUMMARY));
            vi.mocked(getEmbedding).mockResolvedValueOnce(MOCK_EMBEDDING);
            vi.mocked(extractPageRange).mockRejectedValueOnce(new Error('PDF read error'));

            const count = await importPdf('test-lib', { path: '/storage/issue.pdf' });

            // Only 1 succeeded
            expect(count).toBe(1);
        });
    });

    describe('runImport', () => {
        it('orchestrates full import: upsert library, ensure collection, process PDFs', async () => {
            // Setup: each PDF has 1 article
            vi.mocked(extractPageRange).mockResolvedValue(MOCK_TOC_TEXT);
            vi.mocked(generate)
                .mockResolvedValueOnce(
                    JSON.stringify([{ title: 'Art1', startPage: 1, endPage: 5 }])
                )
                .mockResolvedValue(JSON.stringify(MOCK_ARTICLE_SUMMARY));
            vi.mocked(getEmbedding).mockResolvedValue(MOCK_EMBEDDING);

            const result = await runImport('my-library', [{ path: '/storage/lib/2026/01.pdf' }]);

            // Verifies library was upserted with a humanized name
            expect(upsertLibrary).toHaveBeenCalledWith({
                id: 'my-library',
                name: 'My Library'
            });
            expect(ensureCollection).toHaveBeenCalledWith('my-library');
            expect(result.imported).toBe(1);
            expect(result.errors).toHaveLength(0);
            // Stats updated
            expect(countArticles).toHaveBeenCalledWith('my-library');
            expect(updateLibraryStats).toHaveBeenCalledWith('my-library', 3);
        });

        it('reports skipped PDFs when discoverStructure returns empty', async () => {
            vi.mocked(extractPageRange).mockResolvedValue('');

            const result = await runImport('empty-lib', [
                { path: '/storage/empty1.pdf' },
                { path: '/storage/empty2.pdf' }
            ]);

            expect(result.imported).toBe(0);
            expect(result.skipped).toBe(2);
        });

        it('captures errors from failing PDFs', async () => {
            vi.mocked(extractPageRange).mockRejectedValue(new Error('File not found'));

            const result = await runImport('fail-lib', [{ path: '/bad/path.pdf' }]);

            expect(result.skipped).toBe(1);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0]).toContain('/bad/path.pdf');
        });
    });
});
