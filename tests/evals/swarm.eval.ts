/**
 * Eval: Swarm orchestrator end-to-end flow against a live Ollama instance.
 *
 * NOT run in CI — requires a live Ollama at OLLAMA_BASE_URL.
 * Run with:  npm run test:eval
 */

import { describe, it, expect } from 'vitest';
import { LangGraphSwarmOrchestrator } from '../../packages/orchestrator/graph.js';

describe('[eval] LangGraphSwarmOrchestrator — end-to-end', () => {
    it('decomposes and synthesises a simple two-part task', async () => {
        /* tools=[], processors=[] */
        const orchestrator = new LangGraphSwarmOrchestrator([], []);
        const result = await orchestrator.run(
            'List two capital cities in Europe and one in Asia.',
            { maxSubtasks: 2 }
        );
        expect(result.answer.trim().length).toBeGreaterThan(0);
        expect(result.subtaskResults.length).toBeGreaterThanOrEqual(1);
    }, 300_000);
});
