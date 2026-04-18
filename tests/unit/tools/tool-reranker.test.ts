import { describe, expect, it, vi } from 'vitest';
import { ToolReranker } from '@/packages/tools/tool-reranker.js';

describe('ToolReranker', () => {
    it('reranks tools by embedding similarity and caches tool embeddings', async () => {
        const backend = {
            getEmbedding: vi.fn(async (text: string) => {
                const value = text.toLowerCase();
                if (value.includes('alpha') || value.includes('task')) return [1, 0];
                if (value.includes('beta')) return [0.5, 0.5];
                return [0, 1];
            })
        };
        const reranker = new ToolReranker(backend);
        const tools = [
            { name: 'tool_alpha', description: 'alpha capability' },
            { name: 'tool_beta', description: 'beta capability' },
            { name: 'tool_gamma', description: 'gamma capability' }
        ];

        const ranked = await reranker.rerank('task prefers alpha', tools, 2);
        expect(ranked.map((tool) => tool.name)).toEqual(['tool_alpha', 'tool_beta']);
        expect(backend.getEmbedding).toHaveBeenCalledTimes(4);

        backend.getEmbedding.mockClear();
        await reranker.rerank('task prefers alpha again', tools, 2);
        expect(backend.getEmbedding).toHaveBeenCalledTimes(1);
    });
});
