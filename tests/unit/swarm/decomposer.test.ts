/**
 * Unit tests for packages/swarm/decomposer.ts
 *
 * decomposeTask calls the LLM (`generate`), so it is mocked via vi.mock.
 * The tests exercise:
 * - Happy-path decomposition with valid LLM JSON
 * - Fallback when LLM returns empty subtasks array
 * - Fallback when LLM JSON is unparseable
 * - Fallback when the LLM call itself rejects
 * - normaliseSubtask: missing/invalid fields get sensible defaults
 * - cap at maxSubtasks (default 6, hard max 10)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ── Mock the Ollama generate function ─────────────────────────────── */
vi.mock('../../../packages/llm/ollama.js', () => ({
    generate: vi.fn()
}));

/* ── Mock the logger so log output doesn't pollute test output ──────── */
vi.mock('../../../packages/logger/logger.js', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
    }
}));

import { generate } from '../../../packages/llm/ollama.js';
import { decomposeTask } from '../../../packages/swarm/decomposer.js';

const mockGenerate = generate as ReturnType<typeof vi.fn>;

beforeEach(() => {
    vi.clearAllMocks();
});

/* ── Helpers ─────────────────────────────────────────────────────────── */

function validDecompositionJson(subtasks: unknown[], reasoning = 'test reasoning') {
    return JSON.stringify({ reasoning, subtasks });
}

/* ── Tests ───────────────────────────────────────────────────────────── */

describe('decomposeTask', () => {
    it('returns a valid decomposition when the LLM responds with well-formed JSON', async () => {
        const subtasks = [
            { id: 'subtask-0', description: 'Do A', profile: 'fast', dependsOn: [] },
            { id: 'subtask-1', description: 'Do B', profile: 'code', dependsOn: ['subtask-0'] }
        ];
        mockGenerate.mockResolvedValueOnce(validDecompositionJson(subtasks, 'parallel strategy'));

        const result = await decomposeTask('Build something');
        expect(result.reasoning).toBe('parallel strategy');
        expect(result.subtasks).toHaveLength(2);
        expect(result.subtasks[0].id).toBe('subtask-0');
        expect(result.subtasks[0].profile).toBe('fast');
        expect(result.subtasks[1].dependsOn).toContain('subtask-0');
    });

    it('falls back to a single subtask when the LLM returns an empty subtasks array', async () => {
        mockGenerate.mockResolvedValueOnce(JSON.stringify({ reasoning: 'empty', subtasks: [] }));
        const result = await decomposeTask('Simple task');
        expect(result.subtasks).toHaveLength(1);
        expect(result.subtasks[0].id).toBe('subtask-0');
        expect(result.subtasks[0].description).toBe('Simple task');
    });

    it('falls back to a single subtask when the LLM returns invalid JSON', async () => {
        mockGenerate.mockResolvedValueOnce('this is not json at all');
        const result = await decomposeTask('Invalid JSON task');
        expect(result.subtasks).toHaveLength(1);
        expect(result.subtasks[0].description).toBe('Invalid JSON task');
    });

    it('falls back to a single subtask when the LLM call rejects', async () => {
        mockGenerate.mockRejectedValueOnce(new Error('Ollama unavailable'));
        const result = await decomposeTask('Network failure task');
        expect(result.subtasks).toHaveLength(1);
        expect(result.subtasks[0].description).toBe('Network failure task');
    });

    it('caps the number of subtasks to maxSubtasks', async () => {
        const many = Array.from({ length: 8 }, (_, i) => ({
            id: `s-${i}`,
            description: `Task ${i}`,
            profile: 'fast',
            dependsOn: []
        }));
        mockGenerate.mockResolvedValueOnce(validDecompositionJson(many));
        const result = await decomposeTask('Big task', 3);
        expect(result.subtasks.length).toBeLessThanOrEqual(3);
    });

    it('caps maxSubtasks at the hard maximum of 10', async () => {
        const many = Array.from({ length: 12 }, (_, i) => ({
            id: `s-${i}`,
            description: `Task ${i}`,
            profile: 'fast',
            dependsOn: []
        }));
        mockGenerate.mockResolvedValueOnce(validDecompositionJson(many));
        const result = await decomposeTask('Huge task', 20);
        expect(result.subtasks.length).toBeLessThanOrEqual(10);
    });

    it('normalises missing id to "subtask-N"', async () => {
        const subtasks = [{ description: 'Do something', profile: 'fast', dependsOn: [] }];
        mockGenerate.mockResolvedValueOnce(validDecompositionJson(subtasks));
        const result = await decomposeTask('Normalise test');
        expect(result.subtasks[0].id).toBe('subtask-0');
    });

    it('normalises missing description to "Subtask N"', async () => {
        const subtasks = [{ id: 'custom-id', profile: 'fast', dependsOn: [] }];
        mockGenerate.mockResolvedValueOnce(validDecompositionJson(subtasks));
        const result = await decomposeTask('No description test');
        expect(result.subtasks[0].description).toBe('Subtask 0');
    });

    it('normalises invalid profile to "default"', async () => {
        const subtasks = [
            { id: 's-0', description: 'Task', profile: 'unknown-profile', dependsOn: [] }
        ];
        mockGenerate.mockResolvedValueOnce(validDecompositionJson(subtasks));
        const result = await decomposeTask('Bad profile test');
        expect(result.subtasks[0].profile).toBe('default');
    });

    it('normalises missing dependsOn to empty array', async () => {
        const subtasks = [{ id: 's-0', description: 'Task', profile: 'fast' }];
        mockGenerate.mockResolvedValueOnce(validDecompositionJson(subtasks));
        const result = await decomposeTask('No deps test');
        expect(result.subtasks[0].dependsOn).toEqual([]);
    });

    it('filters non-string values out of dependsOn', async () => {
        const subtasks = [
            {
                id: 's-1',
                description: 'Dependent',
                profile: 'fast',
                dependsOn: ['s-0', 42, null, 'valid']
            }
        ];
        mockGenerate.mockResolvedValueOnce(validDecompositionJson(subtasks));
        const result = await decomposeTask('Mixed deps test');
        expect(result.subtasks[0].dependsOn).toEqual(['s-0', 'valid']);
    });

    it('strips markdown code fences before parsing', async () => {
        const raw =
            '```json\n' +
            JSON.stringify({
                reasoning: 'stripped',
                subtasks: [{ id: 's-0', description: 'X', profile: 'fast', dependsOn: [] }]
            }) +
            '\n```';
        mockGenerate.mockResolvedValueOnce(raw);
        const result = await decomposeTask('Fenced JSON');
        expect(result.subtasks[0].id).toBe('s-0');
        expect(result.reasoning).toBe('stripped');
    });
});
