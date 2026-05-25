import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/packages/logger/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

vi.mock('@/packages/persistence/db', () => ({
    getActivityLogAvailability: vi.fn(),
    listActivityLog: vi.fn(),
    exportActivityLog: vi.fn(),
    clearActivityLog: vi.fn()
}));

import { registerHistoryRoutes } from '@/apps/api/history-endpoints';
import {
    clearActivityLog,
    exportActivityLog,
    getActivityLogAvailability,
    listActivityLog
} from '@/packages/persistence/db';

async function startServer(): Promise<{ server: Server; baseUrl: string }> {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        req.requestId = 'history-test-id';
        next();
    });
    registerHistoryRoutes(app);

    const server = await new Promise<Server>((resolve) => {
        const instance = app.listen(0, () => resolve(instance));
    });

    return {
        server,
        baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    };
}

describe('history endpoints', () => {
    let server: Server;
    let baseUrl: string;
    const originalLongPollEnabled = process.env.HISTORY_LONG_POLL_ENABLED;

    beforeEach(async () => {
        ({ server, baseUrl } = await startServer());
        vi.mocked(getActivityLogAvailability).mockReturnValue({ available: true });
        vi.mocked(listActivityLog).mockResolvedValue({
            entries: [],
            nextCursor: undefined,
            hasMore: false
        });
        vi.mocked(exportActivityLog).mockResolvedValue([]);
        vi.mocked(clearActivityLog).mockResolvedValue(0);
        delete process.env.HISTORY_LONG_POLL_ENABLED;
    });

    afterEach(async () => {
        await new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
        });
        if (originalLongPollEnabled === undefined) {
            delete process.env.HISTORY_LONG_POLL_ENABLED;
        } else {
            process.env.HISTORY_LONG_POLL_ENABLED = originalLongPollEnabled;
        }
        vi.clearAllMocks();
    });

    it('GET /history returns incremental entries', async () => {
        vi.mocked(listActivityLog).mockResolvedValue({
            entries: [
                {
                    id: '66527a31a75749a4866be446',
                    timestamp: new Date('2026-05-25T12:00:00.000Z'),
                    kind: 'agent:step',
                    category: 'agent',
                    type: 'step',
                    data: { step: 1 }
                }
            ],
            nextCursor: '66527a31a75749a4866be446',
            hasMore: false
        });

        const response = await fetch(`${baseUrl}/history?since=66527a31a75749a4866be445&limit=10`);
        const body = (await response.json()) as Record<string, unknown>;

        expect(response.status).toBe(200);
        expect(body.success).toBe(true);
        expect((body.data as Record<string, unknown>).count).toBe(1);
        expect((body.data as Record<string, unknown>).nextCursor).toBe('66527a31a75749a4866be446');
    });

    it('GET /history returns 503 when persistence is unavailable', async () => {
        vi.mocked(getActivityLogAvailability).mockReturnValue({
            available: false,
            reason: 'disabled'
        });

        const response = await fetch(`${baseUrl}/history`);
        const body = (await response.json()) as Record<string, unknown>;

        expect(response.status).toBe(503);
        expect(body.success).toBe(false);
    });

    it('GET /history/export returns download payload', async () => {
        vi.mocked(exportActivityLog).mockResolvedValue([
            {
                id: '66527a31a75749a4866be446',
                timestamp: new Date('2026-05-25T12:00:00.000Z'),
                kind: 'agent:start',
                category: 'agent',
                type: 'start',
                data: { task: 'demo' }
            }
        ]);

        const response = await fetch(`${baseUrl}/history/export`);
        const body = (await response.json()) as Record<string, unknown>;

        expect(response.status).toBe(200);
        expect(response.headers.get('content-disposition')).toContain(
            'attachment; filename="manna-history-'
        );
        expect((body.data as Record<string, unknown>).count).toBe(1);
    });

    it('DELETE /history returns deleted count', async () => {
        vi.mocked(clearActivityLog).mockResolvedValue(12);

        const response = await fetch(`${baseUrl}/history`, { method: 'DELETE' });
        const body = (await response.json()) as Record<string, unknown>;

        expect(response.status).toBe(200);
        expect((body.data as Record<string, unknown>).deletedCount).toBe(12);
    });

    it('GET /history/poll returns 404 when long-poll is disabled', async () => {
        delete process.env.HISTORY_LONG_POLL_ENABLED;

        const response = await fetch(`${baseUrl}/history/poll`);

        expect(response.status).toBe(404);
    });

    it('GET /history/poll returns new records when long-poll is enabled', async () => {
        process.env.HISTORY_LONG_POLL_ENABLED = 'true';
        vi.mocked(listActivityLog)
            .mockResolvedValueOnce({ entries: [], nextCursor: undefined, hasMore: false })
            .mockResolvedValueOnce({
                entries: [
                    {
                        id: '66527a31a75749a4866be447',
                        timestamp: new Date('2026-05-25T12:00:01.000Z'),
                        kind: 'tool:result',
                        category: 'tool',
                        type: 'result',
                        data: { tool: 'read_file' }
                    }
                ],
                nextCursor: '66527a31a75749a4866be447',
                hasMore: false
            });

        const response = await fetch(`${baseUrl}/history/poll?limit=5`);
        const body = (await response.json()) as Record<string, unknown>;
        const data = body.data as Record<string, unknown>;

        expect(response.status).toBe(200);
        expect(data.count).toBe(1);
        expect(data.timedOut).toBe(false);
    });
});
