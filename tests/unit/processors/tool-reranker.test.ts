/**
 * Unit tests for packages/processors/tool-reranker.ts.
 *
 * Verifies processor-local cache behavior and tool-set-aware cache rebuilds.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getEmbeddingMock = vi.hoisted(() =>
    vi.fn(async (text: string) => {
        const value = text.toLowerCase();
        if (value.includes('task') || value.includes('alpha')) return [1, 0];
        if (value.includes('beta')) return [0.5, 0.5];
        return [0, 1];
    })
);

vi.mock('../../../packages/llm/embeddings.js', () => ({
    getEmbedding: getEmbeddingMock
}));

vi.mock('../../../packages/logger/logger.js', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

describe('createToolRerankerProcessor', () => {
    beforeEach(() => {
        process.env.TOOL_RERANKER_ENABLED = 'true';
        process.env.TOOL_RERANKER_TOP_N = '2';
        getEmbeddingMock.mockClear();
        vi.resetModules();
    });

    afterEach(() => {
        delete process.env.TOOL_RERANKER_ENABLED;
        delete process.env.TOOL_RERANKER_TOP_N;
    });

    it('reuses cache for the same tool set within one processor instance', async () => {
        const { createToolRerankerProcessor } =
            await import('../../../packages/processors/tool-reranker.js');
        const processor = createToolRerankerProcessor(
            new Map([
                ['tool_alpha', 'alpha'],
                ['tool_beta', 'beta'],
                ['tool_gamma', 'gamma']
            ])
        );

        const first = await processor.processInputStep?.({
            task: 'task: rank alpha',
            context: '',
            memory: [],
            stepNumber: 0,
            tools: ['tool_alpha', 'tool_beta', 'tool_gamma']
        });
        expect(first?.tools).toHaveLength(2);
        expect(getEmbeddingMock).toHaveBeenCalledTimes(4);

        getEmbeddingMock.mockClear();
        await processor.processInputStep?.({
            task: 'task: rank alpha again',
            context: '',
            memory: [],
            stepNumber: 1,
            tools: ['tool_alpha', 'tool_beta', 'tool_gamma']
        });

        /* Same tool set => only the task embedding is recomputed. */
        expect(getEmbeddingMock).toHaveBeenCalledTimes(1);
    });

    it('does not share cache across processor instances with different tool sets', async () => {
        const { createToolRerankerProcessor } =
            await import('../../../packages/processors/tool-reranker.js');

        const firstProcessor = createToolRerankerProcessor(
            new Map([
                ['tool_alpha', 'alpha'],
                ['tool_beta', 'beta'],
                ['tool_gamma', 'gamma']
            ])
        );
        await firstProcessor.processInputStep?.({
            task: 'task: rank alpha',
            context: '',
            memory: [],
            stepNumber: 0,
            tools: ['tool_alpha', 'tool_beta', 'tool_gamma']
        });

        getEmbeddingMock.mockClear();

        const secondProcessor = createToolRerankerProcessor(
            new Map([
                ['tool_delta', 'delta'],
                ['tool_epsilon', 'epsilon'],
                ['tool_zeta', 'zeta']
            ])
        );
        await secondProcessor.processInputStep?.({
            task: 'task: rank delta',
            context: '',
            memory: [],
            stepNumber: 0,
            tools: ['tool_delta', 'tool_epsilon', 'tool_zeta']
        });

        /* New instance + different tool set => descriptions are embedded again. */
        expect(getEmbeddingMock).toHaveBeenCalledTimes(4);
    });
});
