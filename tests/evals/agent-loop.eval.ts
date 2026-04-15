/**
 * Eval: Single-agent end-to-end loop against a live Ollama instance.
 *
 * NOT run in CI — requires a live Ollama at OLLAMA_BASE_URL.
 * Run with:  npm run test:eval
 *
 * The tests are intentionally coarse: they check that the agent
 * returns a non-empty string and does not throw.  Fine-grained quality
 * scoring is done by the evals scorers in packages/evals/.
 */

import { describe, it, expect } from 'vitest';
import { Agent } from '../../packages/agent/agent.js';

describe('[eval] Agent loop — single-agent end-to-end', () => {
    it('returns a non-empty answer for a trivial task', async () => {
        const agent = new Agent([]);
        const runResult = await agent.run('Reply with the single word "hello" and nothing else.');
        expect(typeof runResult.answer).toBe('string');
        expect(runResult.answer.trim().length).toBeGreaterThan(0);
    }, 120_000);

    it('completes within MAX_STEPS for a simple factual question', async () => {
        const agent = new Agent([]);
        const runResult = await agent.run('What is 2 + 2? Answer in one sentence.');
        expect(runResult.answer).toMatch(/4/);
    }, 120_000);
});
