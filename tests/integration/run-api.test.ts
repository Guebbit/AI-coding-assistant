/**
 * Integration tests for apps/api/run-endpoints.ts
 *
 * Verifies `/run` wraps agent output in the standard response envelope
 * without asserting exact LLM wording.
 */

import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRun, mockCreateAgent } = vi.hoisted(() => {
    const run = vi.fn();
    const createAgent = vi.fn(() => ({ run }));
    return { mockRun: run, mockCreateAgent: createAgent };
});

vi.mock('@/packages/logger/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

vi.mock('@/apps/api/agents', () => ({
    createAgent: mockCreateAgent,
    VALID_PROFILES: new Set(['fast', 'reasoning', 'code'])
}));

import { registerRunRoutes } from '@/apps/api/run-endpoints';

async function startServer(): Promise<{ server: Server; baseUrl: string }> {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        req.requestId = 'run-test-request-id';
        next();
    });
    registerRunRoutes(app);

    const server = await new Promise<Server>((resolve) => {
        const instance = app.listen(0, () => resolve(instance));
    });

    return {
        server,
        baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    };
}

describe('run API', () => {
    beforeEach(() => {
        mockCreateAgent.mockClear();
        mockRun.mockReset();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('returns a successful greeting response in the standard envelope', async () => {
        mockRun.mockResolvedValue({
            answer: 'Hello! Nice to meet you.',
            citations: [],
            meta: {
                startedAt: '2026-01-01T00:00:00.000Z',
                durationMs: 12,
                profile: 'fast',
                model: 'fast-model'
            }
        });

        const { server, baseUrl } = await startServer();

        try {
            const response = await fetch(`${baseUrl}/run`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ task: 'Hello there' })
            });
            const body = (await response.json()) as {
                success: boolean;
                status: number;
                data: { result: string; citations: unknown[] };
                meta: {
                    startedAt?: string;
                    durationMs?: number;
                    requestId?: string;
                    profile?: string;
                    model?: string;
                };
            };

            expect(response.status).toBe(200);
            expect(body.success).toBe(true);
            expect(body.status).toBe(200);
            expect(typeof body.data.result).toBe('string');
            expect(body.data.result.trim().length).toBeGreaterThan(0);
            expect(Array.isArray(body.data.citations)).toBe(true);
            expect(body.meta).toMatchObject({
                startedAt: '2026-01-01T00:00:00.000Z',
                durationMs: 12,
                requestId: 'run-test-request-id',
                profile: 'fast',
                model: 'fast-model'
            });
            expect(mockCreateAgent).toHaveBeenCalledWith(false);
            expect(mockRun).toHaveBeenCalledWith('Hello there', undefined);
        } finally {
            await new Promise<void>((resolve, reject) => {
                server.close((error) => (error ? reject(error) : resolve()));
            });
        }
    });
});
