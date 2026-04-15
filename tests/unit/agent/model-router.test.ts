/**
 * Unit tests for packages/agent/model-router.ts
 *
 * Tests routeModel with:
 * - Forced profile (bypass all routing)
 * - Rules-based routing: code keywords, reasoning keywords, default fast
 * - Budget heuristics: context near ceiling → reasoning, duration near ceiling → fast
 *
 * All tests use AGENT_MODEL_ROUTER_MODE=rules so no LLM calls are made.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('routeModel — rules mode', () => {
    /* Force rules mode and set deterministic model names via env vars */
    beforeEach(() => {
        process.env.AGENT_MODEL_ROUTER_MODE = 'rules';
        process.env.AGENT_MODEL_FAST = 'fast-model';
        process.env.AGENT_MODEL_REASONING = 'reasoning-model';
        process.env.AGENT_MODEL_CODE = 'code-model';
        process.env.AGENT_MODEL_DEFAULT = 'default-model';
        /* Budget defaults to generous values unless overridden per test */
        process.env.AGENT_BUDGET_MAX_CONTEXT_CHARS = '50000';
        process.env.AGENT_BUDGET_MAX_DURATION_MS = '60000';
    });

    afterEach(() => {
        /* Clean env so subsequent test suites start fresh */
        for (const key of [
            'AGENT_MODEL_ROUTER_MODE',
            'AGENT_MODEL_FAST',
            'AGENT_MODEL_REASONING',
            'AGENT_MODEL_CODE',
            'AGENT_MODEL_DEFAULT',
            'AGENT_BUDGET_MAX_CONTEXT_CHARS',
            'AGENT_BUDGET_MAX_DURATION_MS'
        ]) {
            delete process.env[key];
        }
        vi.resetModules();
    });

    it('uses forced profile and bypasses all routing', async () => {
        const { routeModel } = await import('../../../packages/agent/model-router.js');
        const result = await routeModel({
            task: 'anything',
            context: '',
            step: 0,
            forcedProfile: 'code'
        });
        expect(result.profile).toBe('code');
        expect(result.reason).toBe('forced_by_caller');
    });

    it('routes to code profile for a task containing "typescript"', async () => {
        const { routeModel } = await import('../../../packages/agent/model-router.js');
        const result = await routeModel({
            task: 'Refactor this TypeScript module to use generics',
            context: '',
            step: 0
        });
        expect(result.profile).toBe('code');
        expect(result.model).toBe('code-model');
    });

    it('routes to code profile for task containing "stack trace"', async () => {
        const { routeModel } = await import('../../../packages/agent/model-router.js');
        const result = await routeModel({
            task: 'fix this stack trace from a failing TypeScript build',
            context: '',
            step: 0
        });
        expect(result.profile).toBe('code');
    });

    it('routes to code profile for task containing "sql"', async () => {
        const { routeModel } = await import('../../../packages/agent/model-router.js');
        const result = await routeModel({
            task: 'write a SQL query for the users table',
            context: '',
            step: 0
        });
        expect(result.profile).toBe('code');
    });

    it('does not route generic "API" questions to code profile', async () => {
        const { routeModel } = await import('../../../packages/agent/model-router.js');
        const result = await routeModel({
            task: 'What is an API?',
            context: '',
            step: 0
        });
        expect(result.profile).toBe('fast');
    });

    it('routes to reasoning profile for task containing "analyze"', async () => {
        const { routeModel } = await import('../../../packages/agent/model-router.js');
        const result = await routeModel({
            task: 'analyze the tradeoffs between REST and GraphQL',
            context: '',
            step: 0
        });
        expect(result.profile).toBe('reasoning');
    });

    it('routes to reasoning profile when step >= 2', async () => {
        const { routeModel } = await import('../../../packages/agent/model-router.js');
        const result = await routeModel({
            task: 'what is the weather like?',
            context: '',
            step: 2
        });
        expect(result.profile).toBe('reasoning');
    });

    it('routes to reasoning profile when task length > 280 chars', async () => {
        const { routeModel } = await import('../../../packages/agent/model-router.js');
        const longTask = 'w'.repeat(281);
        const result = await routeModel({ task: longTask, context: '', step: 0 });
        expect(result.profile).toBe('reasoning');
    });

    it('routes to fast profile for a simple short task', async () => {
        const { routeModel } = await import('../../../packages/agent/model-router.js');
        const result = await routeModel({
            task: 'What is the largest ocean on Earth?',
            context: '',
            step: 0
        });
        expect(result.profile).toBe('fast');
        expect(result.model).toBe('fast-model');
        expect(result.reason).toBe('default_fast');
    });

    it('upgrades to reasoning when context exceeds 80% of ceiling', async () => {
        process.env.AGENT_BUDGET_MAX_CONTEXT_CHARS = '1000';
        const { routeModel } = await import('../../../packages/agent/model-router.js');
        const result = await routeModel({
            task: 'simple task',
            context: '',
            step: 0,
            contextLength: 850 // > 80% of 1000
        });
        expect(result.profile).toBe('reasoning');
        expect(result.reason).toBe('budget:context_near_ceiling');
    });

    it('downgrades to fast when elapsed duration exceeds 70% of ceiling', async () => {
        process.env.AGENT_BUDGET_MAX_DURATION_MS = '10000';
        const { routeModel } = await import('../../../packages/agent/model-router.js');
        const result = await routeModel({
            task: 'analyze this data thoroughly',
            context: '',
            step: 0,
            cumulativeDurationMs: 8000 // > 70% of 10000
        });
        expect(result.profile).toBe('fast');
        expect(result.reason).toBe('budget:duration_near_ceiling');
    });

    it('returns options object with expected keys', async () => {
        const { routeModel } = await import('../../../packages/agent/model-router.js');
        const result = await routeModel({
            task: 'write a function in python',
            context: '',
            step: 0
        });
        expect(result.options).toBeDefined();
        const options = result.options!;
        expect(options).toHaveProperty('temperature');
        expect(options).toHaveProperty('top_p');
        expect(options).toHaveProperty('num_ctx');
    });

    it('uses distinct default options for code vs reasoning profiles', async () => {
        const { routeModel } = await import('../../../packages/agent/model-router.js');
        const code = await routeModel({
            task: 'refactor this TypeScript function',
            context: '',
            step: 0,
            forcedProfile: 'code'
        });
        const reasoning = await routeModel({
            task: 'analyze tradeoffs and reasoning',
            context: '',
            step: 0,
            forcedProfile: 'reasoning'
        });

        expect(code.options).toBeDefined();
        expect(reasoning.options).toBeDefined();
        expect(code.options?.temperature).not.toBe(reasoning.options?.temperature);
        expect(code.options?.top_k).not.toBe(reasoning.options?.top_k);
        expect(code.options?.repeat_penalty).not.toBe(reasoning.options?.repeat_penalty);
    });
});
