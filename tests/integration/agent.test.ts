/**
 * Integration tests for packages/agent/agent.ts
 *
 * The Agent class is tested by mocking `fetch` globally, which intercepts
 * all HTTP calls (Ollama LLM API, Qdrant, embedding API) without requiring
 * any live services.
 *
 * Scenarios covered:
 * 1. Direct-answer shortcut: conversational task with no tool signals → plain text response
 * 2. Single-step completion (action = "none" on first LLM response)
 * 3. Tool call followed by completion
 * 4. Invalid JSON from LLM → self-correction → completion
 * 5. Unknown tool requested → error appended → completion
 * 6. Tool execution failure → error appended → completion
 * 7. Max steps reached → self-debug summary returned
 *
 * Note: tasks used in tests that exercise the full agent loop include at least
 * one tool-signal keyword (e.g. "search", "file", "list") so the model router
 * correctly sets requiresTools=true and does NOT trigger the direct-answer
 * shortcut.  Tasks without tool signals are reserved for direct-answer tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Agent } from '@/packages/agent/agent.js';
import type { ITool } from '@/packages/tools/types.js';

/* ── Mock persistence (PostgreSQL) and diagnostics ───────────────────── */
vi.mock('@/packages/persistence/db.js', () => ({
    saveAgentRun: vi.fn().mockResolvedValue(null)
}));
vi.mock('@/packages/diagnostics/index.js', () => ({
    writeDiagnosticLog: vi.fn().mockResolvedValue('data/diagnostics/test.md'),
    cleanupOldLogs: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('@/packages/logger/logger.js', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

/* ── fetch queue ─────────────────────────────────────────────────────── */

/** Pending JSON response bodies returned in order by the mock fetch. */
const fetchQueue: unknown[] = [];

/** Build an Ollama /api/generate response body for a given agent step. */
function agentResponse(
    thought: string,
    action: string,
    input: Record<string, unknown> = {},
    tokenCounts?: { prompt: number; completion: number }
) {
    return {
        response: JSON.stringify({ thought, action, input }),
        model: 'test-model',
        done: true,
        ...(tokenCounts
            ? { prompt_eval_count: tokenCounts.prompt, eval_count: tokenCounts.completion }
            : {})
    };
}

/** Ollama /api/generate response for the self-debug summary path. */
function debugResponse(summary: string) {
    return { response: summary, model: 'test-model', done: true };
}

/** Fake embedding / Qdrant responses (used by memory module). */
const embeddingOk = { embedding: [0.1, 0.2, 0.3, 0.4] };
const qdrantOk = { vectors: { size: 4 }, status: 'green' };

/**
 * Global mock fetch: dispatches from `fetchQueue` for /api/generate calls,
 * returns stubs for everything else (embeddings, Qdrant).
 *
 * Push `FETCH_FAIL` into fetchQueue to simulate a failed generate call.
 */
const FETCH_FAIL = { __fetchFail: true };

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
    // Qdrant / other
    return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(qdrantOk),
        json: async () => qdrantOk
    };
});

beforeEach(() => {
    /* Set deterministic model names so resolveModel never throws. */
    process.env.AGENT_MODEL_FAST = 'test-model';
    process.env.AGENT_MODEL_REASONING = 'test-model';
    process.env.AGENT_MODEL_CODE = 'test-model';
    process.env.AGENT_MODEL_DEFAULT = 'test-model';
    /* Use rules mode to keep tests deterministic (no extra LLM routing call). */
    process.env.AGENT_MODEL_ROUTER_MODE = 'rules';
    fetchQueue.length = 0;
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockClear();
});

afterEach(() => {
    vi.unstubAllGlobals();
    for (const k of [
        'AGENT_MODEL_FAST',
        'AGENT_MODEL_REASONING',
        'AGENT_MODEL_CODE',
        'AGENT_MODEL_DEFAULT',
        'AGENT_MODEL_ROUTER_MODE'
    ]) {
        delete process.env[k];
    }
});

/* ── Test tools ──────────────────────────────────────────────────────── */

/** A simple echo tool for testing. */
const echoTool: ITool = {
    name: 'echo',
    description: 'Returns the input back as a string',
    execute: vi.fn(async (input: Record<string, unknown>) => JSON.stringify(input))
};

/** A tool that always fails. */
const failingTool: ITool = {
    name: 'failing_tool',
    description: 'Always throws an error',
    execute: vi.fn(async () => {
        throw new Error('tool execution failed');
    })
};

/* ── Tests ───────────────────────────────────────────────────────────── */

describe('Agent.run — direct-answer shortcut', () => {
    it('returns a plain-text answer without tool calls for a conversational task', async () => {
        /*
         * No tool-signal keywords in the task → requiresTools=false at step 0
         * → agent skips the JSON loop and calls the LLM for a plain answer.
         */
        fetchQueue.push({
            response: 'Hello! Doing great, thanks for asking.',
            model: 'test-model',
            done: true
        });

        const agent = new Agent([]);
        const result = await agent.run('Hello, how are you today?');

        expect(result.answer).toBe('Hello! Doing great, thanks for asking.');
        expect(result.meta.steps).toBe(1);
        expect(result.meta.toolCalls).toBe(0);
    });

    it('uses the forced profile but still bypasses tools for a conversational task', async () => {
        fetchQueue.push({
            response: 'Sure, just a quick greeting.',
            model: 'test-model',
            done: true
        });

        const agent = new Agent([]);
        const result = await agent.run('Hey there, what is up?', { profile: 'fast' });

        expect(result.answer).toBe('Sure, just a quick greeting.');
        expect(result.meta.steps).toBe(1);
        expect(result.meta.toolCalls).toBe(0);
        expect(result.meta.profile).toBe('fast');
    });
});

describe('Agent.run — happy paths', () => {
    it('completes in a single step when the LLM returns action "none"', async () => {
        /* Task includes "search" to ensure requiresTools=true → full JSON loop. */
        fetchQueue.push(agentResponse('The answer is 42.', 'none'));

        const agent = new Agent([]);
        const result = await agent.run('Search for: what is 6 times 7?');
        expect(result.answer).toBe('The answer is 42.');
        expect(result.meta.models).toEqual(['test-model']);
        expect(result.meta.steps).toBe(1);
    });

    it('executes a tool and then completes', async () => {
        (echoTool.execute as ReturnType<typeof vi.fn>).mockClear();
        /* Step 1: call the echo tool */
        fetchQueue.push(agentResponse('I need to echo the input.', 'echo', { message: 'hello' }));
        /* Step 2: done after seeing the tool result */
        fetchQueue.push(agentResponse('Echo returned the message.', 'none'));

        const agent = new Agent([echoTool]);
        const result = await agent.run('Search and echo "hello"');
        expect(result.answer).toBe('Echo returned the message.');
        expect(echoTool.execute).toHaveBeenCalledWith({ message: 'hello' });
    });

    it('respects a forcedProfile passed in options', async () => {
        fetchQueue.push(agentResponse('Done.', 'none'));
        const agent = new Agent([]);
        const result = await agent.run('Search files for quick task', { profile: 'fast' });
        expect(result.answer).toBe('Done.');
        expect(result.meta.profile).toBe('fast');
    });

    it('respects a maxSteps override', async () => {
        fetchQueue.push(agentResponse('Done.', 'none'));
        const agent = new Agent([]);
        const result = await agent.run('Search files for quick task', { maxSteps: 1 });
        expect(result.answer).toBe('Done.');
    });

    it('aggregates token metadata across LLM steps', async () => {
        fetchQueue.push(
            agentResponse('Need a tool first.', 'echo', { ok: true }, { prompt: 12, completion: 5 })
        );
        fetchQueue.push(agentResponse('Done now.', 'none', {}, { prompt: 8, completion: 7 }));

        const agent = new Agent([echoTool]);
        const result = await agent.run('Search for token aggregation results');
        expect(result.answer).toBe('Done now.');
        expect(result.meta.promptTokens).toBe(20);
        expect(result.meta.completionTokens).toBe(12);
        expect(result.meta.totalTokens).toBe(32);
    });
});

describe('Agent.run — fail-open / retry paths', () => {
    it('self-corrects when the LLM returns invalid JSON and then completes', async () => {
        /* Step 1: malformed JSON */
        fetchQueue.push({ response: 'not valid json at all', model: 'test-model', done: true });
        /* Step 2: valid response */
        fetchQueue.push(agentResponse('Corrected.', 'none'));

        const agent = new Agent([]);
        const result = await agent.run('Handle invalid JSON'); /* "json" is a tool signal */
        expect(result.answer).toBe('Corrected.');
    });

    it('appends error context for unknown tools and then completes', async () => {
        /* Step 1: unknown tool */
        fetchQueue.push(agentResponse('I will use nonexistent_tool.', 'nonexistent_tool'));
        /* Step 2: agent recovers and finishes */
        fetchQueue.push(agentResponse('Recovered.', 'none'));

        const agent = new Agent([echoTool]);
        const result = await agent.run('Search and use an unknown tool');
        expect(result.answer).toBe('Recovered.');
    });

    it('appends error context when a tool throws and then completes', async () => {
        (failingTool.execute as ReturnType<typeof vi.fn>).mockClear();
        /* Step 1: call failing tool */
        fetchQueue.push(agentResponse('I will call the failing tool.', 'failing_tool'));
        /* Step 2: agent recovers after seeing the error */
        fetchQueue.push(agentResponse('Tool failed but I recovered.', 'none'));

        const agent = new Agent([failingTool]);
        const result = await agent.run('Search and call a failing tool');
        expect(result.answer).toBe('Tool failed but I recovered.');
    });
});

describe('Agent.run — max steps exhaustion', () => {
    it('returns the self-debug summary when max steps are reached', async () => {
        /* Always respond with a tool call — never "none" (maxSteps=2) */
        fetchQueue.push(agentResponse('Calling echo.', 'echo', { x: 1 }));
        fetchQueue.push(agentResponse('Calling echo again.', 'echo', { x: 2 }));
        /* Self-debug summary call */
        fetchQueue.push(debugResponse('The agent got stuck in a loop.'));

        const agent = new Agent([echoTool]);
        const result = await agent.run('Search in the infinite loop task', { maxSteps: 2 });
        expect(result.answer).toBe('The agent got stuck in a loop.');
    });

    it('returns a fallback message when the self-debug LLM call also fails', async () => {
        /* One agent step, then self-debug fails with HTTP 500 */
        fetchQueue.push(agentResponse('Still going.', 'echo'));
        fetchQueue.push(FETCH_FAIL); /* self-debug generate call returns 500 */

        const agent = new Agent([echoTool]);
        const result = await agent.run('Search: self-debug failure', { maxSteps: 1 });
        expect(result.answer).toBe('Max steps reached without a conclusive answer.');
    });
});

describe('Agent.run — processors', () => {
    it('calls processInputStep on every step', async () => {
        const processInputStep = vi.fn(async (args: unknown) => args);
        const processor = { processInputStep };

        fetchQueue.push(agentResponse('Done.', 'none'));
        const agent = new Agent([]);
        agent.addProcessor(processor as Parameters<typeof agent.addProcessor>[0]);
        await agent.run('Search for processor test');
        expect(processInputStep).toHaveBeenCalledOnce();
    });

    it('calls processOutputStep on every parsed step', async () => {
        const processOutputStep = vi.fn(async (args: unknown) => args);
        const processor = { processOutputStep };

        fetchQueue.push(agentResponse('Done.', 'none'));
        const agent = new Agent([]);
        agent.addProcessor(processor as Parameters<typeof agent.addProcessor>[0]);
        await agent.run('Search for output processor test');
        expect(processOutputStep).toHaveBeenCalledOnce();
    });
});
