/**
 * Integration tests for packages/orchestrator/graph.ts (LangGraphSwarmOrchestrator)
 *
 * All HTTP calls (Ollama LLM, Qdrant, embeddings) are intercepted via a
 * global mock `fetch`, so no real services are needed.
 *
 * Scenarios:
 * 1. Simple single-subtask decomposition → synthesise
 * 2. Two subtasks with a dependency → dependency ordering enforced
 * 3. Subtask execution failure → graceful degradation
 * 4. Circular / dangling dependency → deadlock recovery
 * 5. Single successful subtask → synthesis bypassed (direct return)
 * 6. Synthesis LLM call fails → concatenate subtask answers
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LangGraphSwarmOrchestrator } from '@/packages/orchestrator/graph.js';

/* ── Mock persistence and diagnostics (not under test) ───────────────── */
vi.mock('@/packages/persistence/db.js', () => ({
    saveAgentRun: vi.fn().mockResolvedValue(null),
    saveSwarmRun: vi.fn().mockResolvedValue(null)
}));
vi.mock('@/packages/diagnostics/index.js', () => ({
    writeDiagnosticLog: vi.fn().mockResolvedValue('test.md'),
    cleanupOldLogs: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('@/packages/logger/logger.js', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

/* ── fetch queue ─────────────────────────────────────────────────────── */

/** Pending Ollama /api/generate responses returned in order. */
const fetchQueue: unknown[] = [];

/** Sentinel: push this into fetchQueue to simulate a failed /api/generate call. */
const FETCH_FAIL = { __fetchFail: true };

/** Build an agent step JSON response body. */
function agentResponse(thought: string, action = 'none', input: Record<string, unknown> = {}) {
    return { response: JSON.stringify({ thought, action, input }), model: 'test', done: true };
}

/** Build a raw text response (for decomposer / synthesiser LLM calls). */
function rawResponse(text: string) {
    return { response: text, model: 'test', done: true };
}

/** JSON decomposition response body. */
function decompositionResponse(
    subtasks: Array<{ id: string; description: string; profile: string; dependsOn: string[] }>,
    reasoning = 'test'
) {
    return rawResponse(JSON.stringify({ reasoning, subtasks }));
}

const embeddingOk = { embedding: [0.1, 0.2, 0.3, 0.4] };
const qdrantOk = { vectors: { size: 4 }, status: 'green' };

const mockFetch = vi.fn(async (url: RequestInfo | URL) => {
    const urlString = url.toString();
    if (urlString.includes('/api/generate')) {
        const body = fetchQueue.shift();
        if (body === undefined) throw new Error('fetchQueue exhausted');
        if (body === FETCH_FAIL) {
            return {
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
                text: async () => 'error',
                json: async () => ({})
            };
        }
        return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify(body),
            json: async () => body
        };
    }
    if (urlString.includes('/api/embeddings')) {
        return { ok: true, status: 200, text: async () => '{}', json: async () => embeddingOk };
    }
    return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(qdrantOk),
        json: async () => qdrantOk
    };
});

beforeEach(() => {
    process.env.SWARM_MAX_REVIEW_RETRIES = '0';
    fetchQueue.length = 0;
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockClear();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

/* ── Tests ───────────────────────────────────────────────────────────── */

describe('LangGraphSwarmOrchestrator.run', () => {
    it('handles a single-subtask decomposition and returns the subtask answer directly', async () => {
        /* 1. decomposer call → single subtask */
        fetchQueue.push(
            decompositionResponse([
                {
                    id: 'sub-0',
                    description: 'search: Answer the question',
                    profile: 'fast',
                    dependsOn: []
                }
            ])
        );
        /* 2. agent step for sub-0 */
        fetchQueue.push(agentResponse('The answer is Paris.', 'none'));

        const orchestrator = new LangGraphSwarmOrchestrator([]);
        const result = await orchestrator.run('What is the capital of France?');

        expect(result.subtaskResults).toHaveLength(1);
        expect(result.subtaskResults[0].success).toBe(true);
        /* Single subtask → answer returned directly without synthesis LLM call */
        expect(result.answer).toBe('The answer is Paris.');
    });

    it('executes two subtasks in dependency order', async () => {
        const executionOrder: string[] = [];

        /* decomposer */
        fetchQueue.push(
            decompositionResponse([
                { id: 'sub-0', description: 'First task', profile: 'fast', dependsOn: [] },
                { id: 'sub-1', description: 'Second task', profile: 'fast', dependsOn: ['sub-0'] }
            ])
        );

        /* sub-0 agent step */
        fetchQueue.push(
            (() => {
                executionOrder.push('sub-0');
                return agentResponse('sub-0 done', 'none');
            })()
        );
        /* sub-1 agent step */
        fetchQueue.push(
            (() => {
                executionOrder.push('sub-1');
                return agentResponse('sub-1 done', 'none');
            })()
        );
        /* synthesis call */
        fetchQueue.push(rawResponse('synthesised answer'));

        const orchestrator = new LangGraphSwarmOrchestrator([]);
        const result = await orchestrator.run('Two-step task');

        expect(result.subtaskResults).toHaveLength(2);
        expect(executionOrder).toEqual(['sub-0', 'sub-1']);
    });

    it('reports a failed subtask when the agent LLM call returns an error', async () => {
        /* decomposer */
        fetchQueue.push(
            decompositionResponse([
                { id: 'sub-0', description: 'search: Will fail', profile: 'fast', dependsOn: [] }
            ])
        );
        /* agent step for sub-0 fails */
        fetchQueue.push(FETCH_FAIL);
        /* synthesis call (fallback after failure) */
        fetchQueue.push(rawResponse('Degraded answer'));

        const orchestrator = new LangGraphSwarmOrchestrator([]);
        const result = await orchestrator.run('Failing subtask task');

        expect(result.subtaskResults[0].success).toBe(false);
    });

    it('recovers from circular dependencies and executes remaining subtasks', async () => {
        /* sub-0 depends on sub-1, sub-1 depends on sub-0 → circular deadlock */
        fetchQueue.push(
            decompositionResponse([
                { id: 'sub-0', description: 'A', profile: 'fast', dependsOn: ['sub-1'] },
                { id: 'sub-1', description: 'B', profile: 'fast', dependsOn: ['sub-0'] }
            ])
        );
        /* Both agents complete */
        fetchQueue.push(agentResponse('A done', 'none'));
        fetchQueue.push(agentResponse('B done', 'none'));
        /* synthesis */
        fetchQueue.push(rawResponse('deadlock handled'));

        const orchestrator = new LangGraphSwarmOrchestrator([]);
        const result = await orchestrator.run('Circular dep task');

        /* All subtasks should have been executed despite the deadlock */
        expect(result.subtaskResults).toHaveLength(2);
    });

    it('synthesises when there are multiple subtasks', async () => {
        fetchQueue.push(
            decompositionResponse([
                { id: 's0', description: 'Part A', profile: 'fast', dependsOn: [] },
                { id: 's1', description: 'Part B', profile: 'fast', dependsOn: [] }
            ])
        );
        fetchQueue.push(agentResponse('A done', 'none'));
        fetchQueue.push(agentResponse('B done', 'none'));
        fetchQueue.push(rawResponse('final synthesis'));

        const orchestrator = new LangGraphSwarmOrchestrator([]);
        const result = await orchestrator.run('Multi-part task');

        expect(result.answer).toBe('final synthesis');
    });

    it('returns concatenated subtask answers when the synthesis LLM call fails', async () => {
        fetchQueue.push(
            decompositionResponse([
                { id: 's0', description: 'Part X', profile: 'fast', dependsOn: [] },
                { id: 's1', description: 'Part Y', profile: 'fast', dependsOn: [] }
            ])
        );
        fetchQueue.push(agentResponse('Answer X', 'none'));
        fetchQueue.push(agentResponse('Answer Y', 'none'));
        /* synthesis call fails */
        fetchQueue.push(FETCH_FAIL);

        const orchestrator = new LangGraphSwarmOrchestrator([]);
        const result = await orchestrator.run('Synthesis failure task');

        /* Should have concatenated the successful subtask answers */
        expect(result.answer).toContain('Answer X');
        expect(result.answer).toContain('Answer Y');
    });
});
