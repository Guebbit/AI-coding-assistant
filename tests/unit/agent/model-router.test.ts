/**
 * Unit tests for packages/agent/model-router.ts
 *
 * Tests routeModel with:
 * - Forced profile (bypass all routing — no LLM call)
 * - Budget overrides: context near ceiling → reasoning, duration near ceiling → fast
 * - LLM-based routing: success, failure fallback, invalid profile fallback
 *
 * The `generate` function from llm/ollama is mocked so no real LLM calls are made.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../../packages/llm/ollama.js', () => ({
    generate: vi.fn()
}));

describe('routeModel', () => {
    beforeEach(() => {
        process.env.AGENT_MODEL_FAST = 'fast-model';
        process.env.AGENT_MODEL_REASONING = 'reasoning-model';
        process.env.AGENT_MODEL_CODE = 'code-model';
        process.env.AGENT_BUDGET_MAX_CONTEXT_CHARS = '50000';
        process.env.AGENT_BUDGET_MAX_DURATION_MS = '60000';
    });

    afterEach(() => {
        for (const key of [
            'AGENT_MODEL_FAST',
            'AGENT_MODEL_REASONING',
            'AGENT_MODEL_CODE',
            'AGENT_BUDGET_MAX_CONTEXT_CHARS',
            'AGENT_BUDGET_MAX_DURATION_MS'
        ]) {
            delete process.env[key];
        }
        vi.resetModules();
    });

    it('uses forced profile immediately without LLM call', async () => {
        const { generate } = await import('../../../packages/llm/ollama.js');
        const { routeModel } = await import('../../../packages/agent/model-router.js');

        const result = await routeModel({ task: 'anything', context: '', step: 0, forcedProfile: 'code' });

        expect(result.profile).toBe('code');
        expect(result.model).toBe('code-model');
        expect(result.reason).toBe('forced_by_caller');
        expect(vi.mocked(generate)).not.toHaveBeenCalled();
    });

    it('upgrades to reasoning when context exceeds 80% of ceiling (no LLM call)', async () => {
        process.env.AGENT_BUDGET_MAX_CONTEXT_CHARS = '1000';
        const { generate } = await import('../../../packages/llm/ollama.js');
        const { routeModel } = await import('../../../packages/agent/model-router.js');

        const result = await routeModel({ task: 'simple task', context: '', step: 0, contextLength: 850 });

        expect(result.profile).toBe('reasoning');
        expect(result.reason).toBe('budget:context_near_ceiling');
        expect(vi.mocked(generate)).not.toHaveBeenCalled();
    });

    it('downgrades to fast when elapsed duration exceeds 70% of ceiling (no LLM call)', async () => {
        process.env.AGENT_BUDGET_MAX_DURATION_MS = '10000';
        const { generate } = await import('../../../packages/llm/ollama.js');
        const { routeModel } = await import('../../../packages/agent/model-router.js');

        const result = await routeModel({ task: 'analyze this', context: '', step: 0, cumulativeDurationMs: 8000 });

        expect(result.profile).toBe('fast');
        expect(result.reason).toBe('budget:duration_near_ceiling');
        expect(vi.mocked(generate)).not.toHaveBeenCalled();
    });

    it('uses LLM router and routes to code profile', async () => {
        const { generate } = await import('../../../packages/llm/ollama.js');
        vi.mocked(generate).mockResolvedValueOnce('{"profile":"code","reason":"coding task"}');
        const { routeModel } = await import('../../../packages/agent/model-router.js');

        const result = await routeModel({ task: 'write a TypeScript function', context: '', step: 0 });

        expect(result.profile).toBe('code');
        expect(result.model).toBe('code-model');
        expect(vi.mocked(generate)).toHaveBeenCalledOnce();
    });

    it('uses LLM router and routes to reasoning profile', async () => {
        const { generate } = await import('../../../packages/llm/ollama.js');
        vi.mocked(generate).mockResolvedValueOnce('{"profile":"reasoning","reason":"architecture decision"}');
        const { routeModel } = await import('../../../packages/agent/model-router.js');

        const result = await routeModel({ task: 'compare microservices vs monolith', context: '', step: 0 });

        expect(result.profile).toBe('reasoning');
        expect(result.model).toBe('reasoning-model');
    });

    it('uses LLM router and routes to fast profile', async () => {
        const { generate } = await import('../../../packages/llm/ollama.js');
        vi.mocked(generate).mockResolvedValueOnce('{"profile":"fast","reason":"simple question"}');
        const { routeModel } = await import('../../../packages/agent/model-router.js');

        const result = await routeModel({ task: 'What is the capital of France?', context: '', step: 0 });

        expect(result.profile).toBe('fast');
        expect(result.model).toBe('fast-model');
    });

    it('falls back to fast when LLM router throws', async () => {
        const { generate } = await import('../../../packages/llm/ollama.js');
        vi.mocked(generate).mockRejectedValueOnce(new Error('network error'));
        const { routeModel } = await import('../../../packages/agent/model-router.js');

        const result = await routeModel({ task: 'anything', context: '', step: 0 });

        expect(result.profile).toBe('fast');
        expect(result.model).toBe('fast-model');
        expect(result.reason).toBe('router_model_failed_fallback_fast');
    });

    it('falls back to fast when LLM returns invalid profile', async () => {
        const { generate } = await import('../../../packages/llm/ollama.js');
        vi.mocked(generate).mockResolvedValueOnce('{"profile":"unknown_profile","reason":"test"}');
        const { routeModel } = await import('../../../packages/agent/model-router.js');

        const result = await routeModel({ task: 'anything', context: '', step: 0 });

        expect(result.profile).toBe('fast');
        expect(result.reason).toBe('router_model_failed_fallback_fast');
    });

    it('falls back to fast when LLM returns unparseable JSON', async () => {
        const { generate } = await import('../../../packages/llm/ollama.js');
        vi.mocked(generate).mockResolvedValueOnce('not valid json at all');
        const { routeModel } = await import('../../../packages/agent/model-router.js');

        const result = await routeModel({ task: 'anything', context: '', step: 0 });

        expect(result.profile).toBe('fast');
        expect(result.reason).toBe('router_model_failed_fallback_fast');
    });

    it('returns options object with expected keys', async () => {
        const { generate } = await import('../../../packages/llm/ollama.js');
        vi.mocked(generate).mockResolvedValueOnce('{"profile":"code","reason":"coding"}');
        const { routeModel } = await import('../../../packages/agent/model-router.js');

        const result = await routeModel({ task: 'write code', context: '', step: 0 });

        expect(result.options).toBeDefined();
        expect(result.options).toHaveProperty('temperature');
        expect(result.options).toHaveProperty('top_p');
        expect(result.options).toHaveProperty('num_ctx');
    });

    it('uses distinct options for code vs reasoning profiles', async () => {
        const { routeModel } = await import('../../../packages/agent/model-router.js');

        const code = await routeModel({ task: '', context: '', step: 0, forcedProfile: 'code' });
        const reasoning = await routeModel({ task: '', context: '', step: 0, forcedProfile: 'reasoning' });

        expect(code.options?.temperature).not.toBe(reasoning.options?.temperature);
        expect(code.options?.top_k).not.toBe(reasoning.options?.top_k);
        expect(code.options?.repeat_penalty).not.toBe(reasoning.options?.repeat_penalty);
    });
});
