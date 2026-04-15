/**
 * Unit tests for packages/tools/semantic.search.ts.
 *
 * Validates schema-driven input checks and verifies that the tool
 * preserves its response shape and top-K ranking behavior.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { semanticSearchTool } from '../../../packages/tools/semantic.search.js';

describe('semanticSearchTool', () => {
    beforeEach(() => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
                const payload = JSON.parse(String(init?.body ?? '{}')) as { prompt?: string };
                const prompt = (payload.prompt ?? '').toLowerCase();
                const embedding =
                    prompt.includes('dependency injection') || prompt.includes('service container')
                        ? [1, 0]
                        : [0, 1];
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ embedding })
                } as Response;
            })
        );
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('rejects missing query via input schema validation', async () => {
        await expect(
            semanticSearchTool.execute({ documents: ['doc'] } as Record<string, unknown>)
        ).rejects.toThrow();
    });

    it('rejects invalid documents type via input schema validation', async () => {
        await expect(
            semanticSearchTool.execute({
                query: 'dependency injection',
                documents: ['valid', 42]
            } as unknown as Record<string, unknown>)
        ).rejects.toThrow();
    });

    it('returns model/query/totalDocuments/results and applies topK', async () => {
        const result = (await semanticSearchTool.execute({
            query: 'dependency injection',
            documents: ['dependency injection in service container', 'unrelated weather text'],
            topK: 1
        })) as {
            model: string;
            query: string;
            totalDocuments: number;
            results: Array<{ source: string; score: number; snippet: string }>;
        };

        expect(result).toHaveProperty('model');
        expect(result.query).toBe('dependency injection');
        expect(result.totalDocuments).toBe(2);
        expect(result.results).toHaveLength(1);
        expect(result.results[0].source).toBe('document:1');
    });
});
