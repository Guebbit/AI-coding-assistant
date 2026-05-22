/**
 * Unit tests for packages/library/library-store.ts
 *
 * Mocks the Qdrant client to test collection lifecycle logic
 * without connecting to a real Qdrant instance.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

/* ── Mock Qdrant client ────────────────────────────────────────────── */

const mockQdrantClient = vi.hoisted(() => ({
    createCollection: vi.fn(),
    deleteCollection: vi.fn(),
    upsert: vi.fn(),
    search: vi.fn()
}));

vi.mock('@qdrant/js-client-rest', () => ({
    QdrantClient: class {
        createCollection = mockQdrantClient.createCollection;
        deleteCollection = mockQdrantClient.deleteCollection;
        upsert = mockQdrantClient.upsert;
        search = mockQdrantClient.search;
    }
}));

vi.mock('@/packages/logger/logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn()
    }
}));

/* ── Import module under test ──────────────────────────────────────── */

import {
    collectionName,
    ensureCollection,
    upsertPoint,
    searchPoints,
    deleteCollection
} from '@/packages/library/library-store';

/* ── Tests ─────────────────────────────────────────────────────────── */

describe('library/library-store', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('collectionName', () => {
        it('derives collection name from library ID', () => {
            expect(collectionName('scientific-american')).toBe('library-scientific-american');
            expect(collectionName('my-lib')).toBe('library-my-lib');
        });
    });

    describe('ensureCollection', () => {
        it('creates collection with cosine distance and default vector size', async () => {
            mockQdrantClient.createCollection.mockResolvedValue(true);

            await ensureCollection('test-lib');

            expect(mockQdrantClient.createCollection).toHaveBeenCalledWith('library-test-lib', {
                vectors: { size: 768, distance: 'Cosine' }
            });
        });

        it('accepts custom vector size', async () => {
            mockQdrantClient.createCollection.mockResolvedValue(true);

            await ensureCollection('test-lib', 1536);

            expect(mockQdrantClient.createCollection).toHaveBeenCalledWith('library-test-lib', {
                vectors: { size: 1536, distance: 'Cosine' }
            });
        });

        it('silently ignores "already exists" errors', async () => {
            mockQdrantClient.createCollection.mockRejectedValue(
                new Error('Collection already exists')
            );

            // Should not throw
            await expect(ensureCollection('existing-lib')).resolves.toBeUndefined();
        });
    });

    describe('upsertPoint', () => {
        it('upserts a single point with payload', async () => {
            mockQdrantClient.upsert.mockResolvedValue({ status: 'completed' });

            const vector = [0.1, 0.2, 0.3];
            const payload = { title: 'Test', year: 2026 };

            await upsertPoint('my-lib', 'point-uuid-123', vector, payload);

            expect(mockQdrantClient.upsert).toHaveBeenCalledWith('library-my-lib', {
                wait: true,
                points: [
                    {
                        id: 'point-uuid-123',
                        vector: [0.1, 0.2, 0.3],
                        payload: { title: 'Test', year: 2026 }
                    }
                ]
            });
        });
    });

    describe('searchPoints', () => {
        it('performs ANN search and returns mapped results', async () => {
            mockQdrantClient.search.mockResolvedValue([
                { id: 'id-1', score: 0.9, payload: { title: 'First' } },
                { id: 'id-2', score: 0.8, payload: { title: 'Second' } }
            ]);

            const results = await searchPoints('my-lib', [0.1, 0.2], 5);

            expect(mockQdrantClient.search).toHaveBeenCalledWith('library-my-lib', {
                vector: [0.1, 0.2],
                limit: 5,
                filter: undefined,
                with_payload: true
            });
            expect(results).toHaveLength(2);
            expect(results[0]).toEqual({ id: 'id-1', score: 0.9, payload: { title: 'First' } });
        });

        it('passes filter through to Qdrant', async () => {
            mockQdrantClient.search.mockResolvedValue([]);
            const filter = { must: [{ key: 'year', match: { value: 2026 } }] };

            await searchPoints('my-lib', [0.5], 3, filter);

            expect(mockQdrantClient.search).toHaveBeenCalledWith('library-my-lib', {
                vector: [0.5],
                limit: 3,
                filter,
                with_payload: true
            });
        });

        it('handles null payload gracefully', async () => {
            mockQdrantClient.search.mockResolvedValue([{ id: 'x', score: 0.5, payload: null }]);

            const results = await searchPoints('my-lib', [0.1], 1);

            expect(results[0].payload).toEqual({});
        });
    });

    describe('deleteCollection', () => {
        it('deletes the collection for a library', async () => {
            mockQdrantClient.deleteCollection.mockResolvedValue(true);

            await deleteCollection('old-lib');

            expect(mockQdrantClient.deleteCollection).toHaveBeenCalledWith('library-old-lib');
        });

        it('silently ignores errors when collection does not exist', async () => {
            mockQdrantClient.deleteCollection.mockRejectedValue(new Error('Collection not found'));

            await expect(deleteCollection('ghost-lib')).resolves.toBeUndefined();
        });
    });
});
