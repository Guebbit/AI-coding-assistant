/**
 * Unit tests for apps/api/middlewares/security.ts.
 */

import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

const originalRateLimitMax = process.env.RATE_LIMIT_MAX;
const originalRateLimitWindowMs = process.env.RATE_LIMIT_WINDOW_MS;

async function startServer(): Promise<{ server: Server; baseUrl: string }> {
    vi.resetModules();
    const { rateLimiter } = await import('@/apps/api/middlewares/security.js');

    const app = express();
    app.use(rateLimiter);
    app.get('/ping', (_req, res) => {
        res.status(200).json({ ok: true });
    });

    const server = await new Promise<Server>((resolve) => {
        const instance = app.listen(0, () => resolve(instance));
    });

    return {
        server,
        baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    };
}

describe('rateLimiter', () => {
    afterEach(() => {
        if (originalRateLimitMax === undefined) {
            delete process.env.RATE_LIMIT_MAX;
        } else {
            process.env.RATE_LIMIT_MAX = originalRateLimitMax;
        }

        if (originalRateLimitWindowMs === undefined) {
            delete process.env.RATE_LIMIT_WINDOW_MS;
        } else {
            process.env.RATE_LIMIT_WINDOW_MS = originalRateLimitWindowMs;
        }
    });

    it('enforces RATE_LIMIT_MAX when set to a positive number', async () => {
        process.env.RATE_LIMIT_WINDOW_MS = '60000';
        process.env.RATE_LIMIT_MAX = '2';

        const { server, baseUrl } = await startServer();
        try {
            const first = await fetch(`${baseUrl}/ping`);
            const second = await fetch(`${baseUrl}/ping`);
            const third = await fetch(`${baseUrl}/ping`);

            expect(first.status).toBe(200);
            expect(second.status).toBe(200);
            expect(third.status).toBe(429);
        } finally {
            await new Promise<void>((resolve, reject) => {
                server.close((error) => (error ? reject(error) : resolve()));
            });
        }
    });

    it('disables rate limiting when RATE_LIMIT_MAX is 0', async () => {
        process.env.RATE_LIMIT_WINDOW_MS = '60000';
        process.env.RATE_LIMIT_MAX = '0';

        const { server, baseUrl } = await startServer();
        try {
            const responses = await Promise.all(
                Array.from({ length: 5 }, () => fetch(`${baseUrl}/ping`))
            );

            responses.forEach((response) => {
                expect(response.status).toBe(200);
            });
        } finally {
            await new Promise<void>((resolve, reject) => {
                server.close((error) => (error ? reject(error) : resolve()));
            });
        }
    });
});
