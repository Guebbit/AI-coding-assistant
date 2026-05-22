/**
 * Unit tests for packages/library/search.ts
 *
 * Mocks Qdrant search and embedding to validate the semantic search
 * pipeline: query embedding → ANN search → result mapping.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

/* ── Mock dependencies ─────────────────────────────────────────────── */

vi.mock('@/packages/llm/embeddings', () => ({
    getEmbedding: vi.fn()
}));

vi.mock('@/packages/library/library-store', () => ({
    searchPoints: vi.fn()
}));

vi.mock('@/packages/logger/logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn()
    }
}));

/* ── Import mocked modules + module under test ─────────────────────── */

import { getEmbedding } from '@/packages/llm/embeddings';
import { searchPoints } from '@/packages/library/library-store';
import { searchLibrary } from '@/packages/library/search';

/* ── Test data ─────────────────────────────────────────────────────── */

const MOCK_QUERY_VECTOR = Array.from({ length: 768 }, (_, i) => Math.cos(i * 0.05));

const MOCK_QDRANT_HITS = [
    {
        id: 'point-uuid-1',
        score: 0.95,
        payload: {
            title: 'The Future of AI',
            summary: 'An article about artificial intelligence advances.',
            topics: ['AI', 'technology', 'future'],
            year: 2026,
            month: 'March',
            startPage: 12,
            endPage: 23,
            pdfPath: '/storage/sa/2026/03.pdf',
            pdfPageOffset: 0
        }
    },
    {
        id: 'point-uuid-2',
        score: 0.82,
        payload: {
            title: 'Ocean Exploration',
            summary: 'Deep sea discoveries and new technology.',
            topics: ['ocean', 'exploration', 'marine'],
            year: 2026,
            month: 'March',
            startPage: 24,
            endPage: 37,
            pdfPath: '/storage/sa/2026/03.pdf',
            pdfPageOffset: 0
        }
    }
];

/* ── Tests ─────────────────────────────────────────────────────────── */

describe('library/search', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('embeds query, searches Qdrant, and returns ranked articles', async () => {
        vi.mocked(getEmbedding).mockResolvedValue(MOCK_QUERY_VECTOR);
        vi.mocked(searchPoints).mockResolvedValue(MOCK_QDRANT_HITS);

        const results = await searchLibrary('scientific-american', {
            query: 'artificial intelligence advances'
        });

        // Embedding was called with the query
        expect(getEmbedding).toHaveBeenCalledWith('artificial intelligence advances');
        // searchPoints was called with the right params
        expect(searchPoints).toHaveBeenCalledWith(
            'scientific-american',
            MOCK_QUERY_VECTOR,
            5, // default topK
            undefined // no filter
        );
        // Results mapped correctly
        expect(results).toHaveLength(2);
        expect(results[0].title).toBe('The Future of AI');
        expect(results[0].score).toBe(0.95);
        expect(results[0].qdrantPointId).toBe('point-uuid-1');
        expect(results[1].title).toBe('Ocean Exploration');
        expect(results[1].score).toBe(0.82);
    });

    it('passes custom topK to searchPoints', async () => {
        vi.mocked(getEmbedding).mockResolvedValue(MOCK_QUERY_VECTOR);
        vi.mocked(searchPoints).mockResolvedValue([]);

        await searchLibrary('test-lib', { query: 'test', topK: 10 });

        expect(searchPoints).toHaveBeenCalledWith('test-lib', MOCK_QUERY_VECTOR, 10, undefined);
    });

    it('builds Qdrant year filter when filters.year is provided', async () => {
        vi.mocked(getEmbedding).mockResolvedValue(MOCK_QUERY_VECTOR);
        vi.mocked(searchPoints).mockResolvedValue([]);

        await searchLibrary('test-lib', {
            query: 'climate',
            filters: { year: 2025 }
        });

        expect(searchPoints).toHaveBeenCalledWith(
            'test-lib',
            MOCK_QUERY_VECTOR,
            5,
            { must: [{ key: 'year', match: { value: 2025 } }] }
        );
    });

    it('builds Qdrant month filter when filters.month is provided', async () => {
        vi.mocked(getEmbedding).mockResolvedValue(MOCK_QUERY_VECTOR);
        vi.mocked(searchPoints).mockResolvedValue([]);

        await searchLibrary('test-lib', {
            query: 'ocean',
            filters: { month: 'March' }
        });

        expect(searchPoints).toHaveBeenCalledWith(
            'test-lib',
            MOCK_QUERY_VECTOR,
            5,
            { must: [{ key: 'month', match: { value: 'March' } }] }
        );
    });

    it('combines year + month filters', async () => {
        vi.mocked(getEmbedding).mockResolvedValue(MOCK_QUERY_VECTOR);
        vi.mocked(searchPoints).mockResolvedValue([]);

        await searchLibrary('test-lib', {
            query: 'test',
            filters: { year: 2026, month: 'January' }
        });

        expect(searchPoints).toHaveBeenCalledWith(
            'test-lib',
            MOCK_QUERY_VECTOR,
            5,
            {
                must: [
                    { key: 'year', match: { value: 2026 } },
                    { key: 'month', match: { value: 'January' } }
                ]
            }
        );
    });

    it('returns empty array when no hits', async () => {
        vi.mocked(getEmbedding).mockResolvedValue(MOCK_QUERY_VECTOR);
        vi.mocked(searchPoints).mockResolvedValue([]);

        const results = await searchLibrary('empty-lib', { query: 'nothing here' });

        expect(results).toEqual([]);
    });

    it('handles missing payload fields gracefully', async () => {
        vi.mocked(getEmbedding).mockResolvedValue(MOCK_QUERY_VECTOR);
        vi.mocked(searchPoints).mockResolvedValue([
            {
                id: 'sparse-point',
                score: 0.7,
                payload: { title: 'Sparse Article' } // minimal payload
            }
        ]);

        const results = await searchLibrary('test-lib', { query: 'sparse' });

        expect(results[0].title).toBe('Sparse Article');
        expect(results[0].summary).toBe('');
        expect(results[0].topics).toEqual([]);
        expect(results[0].year).toBe(0);
        expect(results[0].month).toBe('');
    });
});
