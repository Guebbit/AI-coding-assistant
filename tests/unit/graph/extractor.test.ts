/**
 * Unit tests for packages/graph/extractor.ts
 *
 * These tests verify:
 * - Empty text returns an empty extraction result.
 * - Successful Ollama response is parsed and validated correctly.
 * - Malformed JSON from Ollama returns an empty result (fail-open).
 * - Non-OK HTTP responses return an empty result (fail-open).
 * - Responses with unknown entity types are coerced to "Other".
 * - Fetch errors return an empty result (fail-open).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { extractEntitiesAndRelationships } from '../../../packages/graph/extractor.js';

/* ── helpers ─────────────────────────────────────────────────────────── */

/**
 * Build a minimal mock Response whose `.json()` returns the given object.
 */
function mockOllamaOk(response: string): Response {
    return {
        ok: true,
        json: async () => ({ response }),
        status: 200,
        statusText: 'OK'
    } as unknown as Response;
}

function mockOllamaError(status: number): Response {
    return {
        ok: false,
        json: async () => ({}),
        status,
        statusText: 'Error'
    } as unknown as Response;
}

/* ── tests ───────────────────────────────────────────────────────────── */

describe('extractEntitiesAndRelationships', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('returns empty result for blank text without calling fetch', async () => {
        const result = await extractEntitiesAndRelationships('   ');
        expect(result.entities).toHaveLength(0);
        expect(result.relationships).toHaveLength(0);
        expect(fetch).not.toHaveBeenCalled();
    });

    it('parses a valid Ollama response', async () => {
        const payload = JSON.stringify({
            entities: [
                { name: 'TypeScript', type: 'Technology', description: 'Typed JS superset' },
                { name: 'Microsoft', type: 'Organization' }
            ],
            relationships: [{ from: 'TypeScript', to: 'Microsoft', type: 'authored_by' }]
        });
        vi.mocked(fetch).mockResolvedValue(mockOllamaOk(payload));

        const result = await extractEntitiesAndRelationships('TypeScript was made by Microsoft.');

        expect(result.entities).toHaveLength(2);
        expect(result.entities[0]).toMatchObject({ name: 'TypeScript', type: 'Technology' });
        expect(result.relationships).toHaveLength(1);
        expect(result.relationships[0]).toMatchObject({ from: 'TypeScript', to: 'Microsoft' });
    });

    it('coerces unknown entity types to "Other"', async () => {
        const payload = JSON.stringify({
            entities: [{ name: 'X', type: 'Galaxy' }],
            relationships: []
        });
        vi.mocked(fetch).mockResolvedValue(mockOllamaOk(payload));

        const result = await extractEntitiesAndRelationships('Some text about X.');
        expect(result.entities[0].type).toBe('Other');
    });

    it('accepts entity types case-insensitively', async () => {
        const payload = JSON.stringify({
            entities: [{ name: 'React', type: 'technology' }],
            relationships: []
        });
        vi.mocked(fetch).mockResolvedValue(mockOllamaOk(payload));

        const result = await extractEntitiesAndRelationships('React is a technology.');
        expect(result.entities[0].type).toBe('Technology');
    });

    it('handles code-fenced JSON from LLM', async () => {
        const payload =
            '```json\n' +
            JSON.stringify({
                entities: [{ name: 'Node', type: 'Technology' }],
                relationships: []
            }) +
            '\n```';
        vi.mocked(fetch).mockResolvedValue(mockOllamaOk(payload));

        const result = await extractEntitiesAndRelationships('Node is a runtime.');
        expect(result.entities).toHaveLength(1);
        expect(result.entities[0].name).toBe('Node');
    });

    it('returns empty result on malformed JSON (fail-open)', async () => {
        vi.mocked(fetch).mockResolvedValue(mockOllamaOk('this is not json at all'));

        const result = await extractEntitiesAndRelationships('Some text.');
        expect(result.entities).toHaveLength(0);
        expect(result.relationships).toHaveLength(0);
    });

    it('returns empty result on schema mismatch (fail-open)', async () => {
        /* "entities" is a string, not an array — schema validation fails. */
        const payload = JSON.stringify({ entities: 'invalid', relationships: [] });
        vi.mocked(fetch).mockResolvedValue(mockOllamaOk(payload));

        const result = await extractEntitiesAndRelationships('Some text.');
        expect(result.entities).toHaveLength(0);
    });

    it('returns empty result when Ollama returns non-OK status (fail-open)', async () => {
        vi.mocked(fetch).mockResolvedValue(mockOllamaError(503));

        const result = await extractEntitiesAndRelationships('Some text.');
        expect(result.entities).toHaveLength(0);
        expect(result.relationships).toHaveLength(0);
    });

    it('returns empty result when fetch throws (fail-open)', async () => {
        vi.mocked(fetch).mockRejectedValue(new Error('ECONNREFUSED'));

        const result = await extractEntitiesAndRelationships('Some text.');
        expect(result.entities).toHaveLength(0);
        expect(result.relationships).toHaveLength(0);
    });

    it('returns empty result when Ollama returns no response field', async () => {
        const payload = '{}';
        vi.mocked(fetch).mockResolvedValue(mockOllamaOk(payload));

        const result = await extractEntitiesAndRelationships('Some text.');
        expect(result.entities).toHaveLength(0);
    });
});
