/**
 * Integration tests for apps/api/events-endpoints.ts
 *
 * Verifies GET /events/stream opens an SSE connection, sends a `connected`
 * event immediately, and forwards bus events to the client.
 */

import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/packages/logger/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

import { registerEventsRoutes } from '@/apps/api/events-endpoints';
import { emit } from '@/packages/events/bus';

async function startServer(): Promise<{ server: Server; baseUrl: string }> {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        req.requestId = 'events-test-id';
        next();
    });
    registerEventsRoutes(app);

    const server = await new Promise<Server>((resolve) => {
        const instance = app.listen(0, () => resolve(instance));
    });

    return {
        server,
        baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    };
}

/** Parse raw SSE text into structured frames. */
function parseSseFrames(raw: string): Array<{ event: string; data: unknown }> {
    return raw
        .split('\n\n')
        .filter((block) => block.trim().length > 0)
        .map((block) => {
            const eventMatch = block.match(/^event:\s*(.+)$/m);
            const dataMatch = block.match(/^data:\s*(.+)$/m);
            return {
                event: eventMatch?.[1] ?? '',
                data: dataMatch ? JSON.parse(dataMatch[1]) : null,
            };
        });
}

describe('GET /events/stream', () => {
    let server: Server;
    let baseUrl: string;

    beforeEach(async () => {
        ({ server, baseUrl } = await startServer());
    });

    afterEach(async () => {
        await new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
        });
        vi.clearAllMocks();
    });

    it('sends a connected event immediately on connect', async () => {
        const controller = new AbortController();

        const response = await fetch(`${baseUrl}/events/stream`, {
            signal: controller.signal,
        });

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('text/event-stream');

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();

        /* Read the first chunk (should contain the connected event). */
        const { value } = await reader.read();
        const text = decoder.decode(value);
        const frames = parseSseFrames(text);

        expect(frames.length).toBeGreaterThanOrEqual(1);
        expect(frames[0].event).toBe('connected');
        expect((frames[0].data as Record<string, unknown>).message).toBe('Event stream active');

        controller.abort();
    });

    it('forwards bus events to the SSE client', async () => {
        const controller = new AbortController();

        const response = await fetch(`${baseUrl}/events/stream`, {
            signal: controller.signal,
        });

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();

        /* Consume the initial connected event. */
        await reader.read();

        /* Emit a bus event and read it from the stream. */
        emit({ type: 'agent:step', payload: { step: 0, parsed: { thought: 'test', action: 'read_file' } } });

        /* Small delay for the event to propagate through the stream. */
        await new Promise((resolve) => setTimeout(resolve, 50));

        const { value } = await reader.read();
        const text = decoder.decode(value);
        const frames = parseSseFrames(text);

        const stepFrame = frames.find((f) => f.event === 'agent:step');
        expect(stepFrame).toBeDefined();
        expect((stepFrame!.data as Record<string, unknown>).step).toBe(0);

        controller.abort();
    });
});
