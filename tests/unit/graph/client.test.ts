/**
 * Unit tests for packages/graph/client.ts
 *
 * These tests verify the fail-open guarantees of the Neo4j client wrapper:
 * - `isGraphAvailable()` returns `false` when the driver throws.
 * - `runCypher()` returns an empty array (not throws) on connection failure.
 * - `ensureConstraints()` does not throw when Neo4j is unreachable.
 *
 * The tests mock the `neo4j-driver` module at module level so no real
 * Neo4j server is required.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ── Hoist mock factories so they are available inside vi.mock() ─────── */

const { mockRun, mockClose, mockSession, mockDriverClose } = vi.hoisted(() => {
    const mockRun = vi.fn();
    const mockClose = vi.fn().mockResolvedValue(undefined);
    const mockSession = vi.fn().mockReturnValue({ run: mockRun, close: mockClose });
    const mockDriverClose = vi.fn().mockResolvedValue(undefined);
    return { mockRun, mockClose, mockSession, mockDriverClose };
});

/* ── Mock neo4j-driver ───────────────────────────────────────────────── */

vi.mock('neo4j-driver', () => ({
    default: {
        driver: vi.fn().mockReturnValue({
            session: mockSession,
            close: mockDriverClose
        }),
        auth: {
            basic: vi.fn().mockReturnValue({})
        }
    }
}));

/* ── Mock the logger so log output doesn't pollute test output ──────── */
vi.mock('../../../packages/logger/logger.js', () => ({
    getLogger: () => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
    })
}));

/* ── import after mock ───────────────────────────────────────────────── */

import {
    isGraphAvailable,
    runCypher,
    ensureConstraints,
    closeDriver
} from '../../../packages/graph/client.js';

describe('graph/client', () => {
    beforeEach(async () => {
        /* Reset the singleton driver so each test starts fresh. */
        await closeDriver();
        mockRun.mockReset();
        mockClose.mockReset().mockResolvedValue(undefined);
        mockSession.mockClear();
    });

    describe('isGraphAvailable', () => {
        it('returns true when the ping query succeeds', async () => {
            mockRun.mockResolvedValueOnce({ records: [] });

            const result = await isGraphAvailable();
            expect(result).toBe(true);
        });

        it('returns false when the session throws (fail-open)', async () => {
            mockRun.mockRejectedValueOnce(new Error('ServiceUnavailable'));

            const result = await isGraphAvailable();
            expect(result).toBe(false);
        });
    });

    describe('runCypher', () => {
        it('returns mapped rows on success', async () => {
            const fakeRecord = {
                toObject: () => ({ name: 'TypeScript', type: 'Technology' })
            };
            mockRun.mockResolvedValueOnce({ records: [fakeRecord] });

            const rows = await runCypher('MATCH (e:Entity) RETURN e.name AS name');
            expect(rows).toHaveLength(1);
            expect(rows[0]).toEqual({ name: 'TypeScript', type: 'Technology' });
        });

        it('returns empty array on connection failure (fail-open)', async () => {
            mockRun.mockRejectedValueOnce(new Error('ECONNREFUSED'));

            const rows = await runCypher('MATCH (e) RETURN e');
            expect(rows).toEqual([]);
        });

        it('returns empty array when there are no matching records', async () => {
            mockRun.mockResolvedValueOnce({ records: [] });

            const rows = await runCypher('MATCH (e:Entity { name: "none" }) RETURN e');
            expect(rows).toEqual([]);
        });
    });

    describe('ensureConstraints', () => {
        it('does not throw even when Neo4j is unreachable (fail-open)', async () => {
            mockRun.mockRejectedValue(new Error('ServiceUnavailable'));

            await expect(ensureConstraints()).resolves.toBeUndefined();
        });

        it('completes silently when constraint creation succeeds', async () => {
            mockRun.mockResolvedValueOnce({ records: [] });

            await expect(ensureConstraints()).resolves.toBeUndefined();
        });
    });
});
