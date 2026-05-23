/**
 * Integration tests for apps/api/logs-endpoints.ts
 *
 * Verifies GET /logs/errors parsing, filtering, and standard response envelope
 * without touching the real filesystem (log file is injected via env var).
 */

import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/packages/logger/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

import { registerLogsRoutes } from '@/apps/api/logs-endpoints';

async function startServer(): Promise<{ server: Server; baseUrl: string }> {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        req.requestId = 'logs-test-id';
        next();
    });
    registerLogsRoutes(app);

    const server = await new Promise<Server>((resolve) => {
        const instance = app.listen(0, () => resolve(instance));
    });

    return {
        server,
        baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    };
}

/** Write a temporary JSON-lines log file and return its path. */
async function writeTemporaryLog(entries: object[]): Promise<string> {
    const temporaryFile = path.join(os.tmpdir(), `manna-test-errors-${Date.now()}.log`);
    const content = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
    await fs.writeFile(temporaryFile, content, 'utf-8');
    return temporaryFile;
}

describe('GET /logs/errors', () => {
    let server: Server;
    let baseUrl: string;
    let temporaryLogFile: string;
    const originalLogEnvironmentVariable = process.env.LOG_ERROR_FILE;

    beforeEach(async () => {
        ({ server, baseUrl } = await startServer());
    });

    afterEach(async () => {
        await new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
        });
        /* Restore env and clean up tmp file. */
        if (originalLogEnvironmentVariable === undefined) {
            delete process.env.LOG_ERROR_FILE;
        } else {
            process.env.LOG_ERROR_FILE = originalLogEnvironmentVariable;
        }
        if (temporaryLogFile) {
            await fs.unlink(temporaryLogFile).catch(() => undefined);
        }
        vi.clearAllMocks();
    });

    it('returns empty entries and 200 when log file does not exist', async () => {
        process.env.LOG_ERROR_FILE = '/nonexistent/error.log';

        const response = await fetch(`${baseUrl}/logs/errors`);
        const body = (await response.json()) as Record<string, unknown>;

        expect(response.status).toBe(200);
        expect(body.success).toBe(true);
        expect((body.data as Record<string, unknown>).entries).toEqual([]);
        expect((body.data as Record<string, unknown>).total).toBe(0);
    });

    it('returns parsed entries from the log file', async () => {
        const entries = [
            {
                timestamp: '2026-05-23T10:00:00.000Z',
                level: 'error',
                message: 'first_error',
                component: 'api.run',
                service: 'manna'
            },
            {
                timestamp: '2026-05-23T11:00:00.000Z',
                level: 'error',
                message: 'second_error',
                component: 'api.chat',
                service: 'manna'
            }
        ];
        temporaryLogFile = await writeTemporaryLog(entries);
        process.env.LOG_ERROR_FILE = temporaryLogFile;

        const response = await fetch(`${baseUrl}/logs/errors`);
        const body = (await response.json()) as Record<string, unknown>;

        expect(response.status).toBe(200);
        expect(body.success).toBe(true);
        const data = body.data as Record<string, unknown>;
        expect(data.total).toBe(2);
        expect((data.entries as unknown[]).length).toBe(2);
    });

    it('returns entries newest-first', async () => {
        const entries = [
            { timestamp: '2026-05-23T10:00:00.000Z', level: 'error', message: 'older' },
            { timestamp: '2026-05-23T11:00:00.000Z', level: 'error', message: 'newer' }
        ];
        temporaryLogFile = await writeTemporaryLog(entries);
        process.env.LOG_ERROR_FILE = temporaryLogFile;

        const response = await fetch(`${baseUrl}/logs/errors`);
        const body = (await response.json()) as Record<string, unknown>;
        const returnedEntries = (body.data as Record<string, unknown>).entries as Array<
            Record<string, unknown>
        >;

        expect(returnedEntries[0].message).toBe('newer');
        expect(returnedEntries[1].message).toBe('older');
    });

    it('filters by component', async () => {
        const entries = [
            {
                timestamp: '2026-05-23T10:00:00.000Z',
                level: 'error',
                message: 'e1',
                component: 'api.run'
            },
            {
                timestamp: '2026-05-23T10:01:00.000Z',
                level: 'error',
                message: 'e2',
                component: 'api.chat'
            }
        ];
        temporaryLogFile = await writeTemporaryLog(entries);
        process.env.LOG_ERROR_FILE = temporaryLogFile;

        const response = await fetch(`${baseUrl}/logs/errors?component=api.run`);
        const body = (await response.json()) as Record<string, unknown>;
        const data = body.data as Record<string, unknown>;

        expect(data.total).toBe(1);
        const returnedEntries = data.entries as Array<Record<string, unknown>>;
        expect(returnedEntries[0].component).toBe('api.run');
    });

    it('filters by since', async () => {
        const entries = [
            { timestamp: '2026-05-23T09:00:00.000Z', level: 'error', message: 'before' },
            { timestamp: '2026-05-23T11:00:00.000Z', level: 'error', message: 'after' }
        ];
        temporaryLogFile = await writeTemporaryLog(entries);
        process.env.LOG_ERROR_FILE = temporaryLogFile;

        const response = await fetch(`${baseUrl}/logs/errors?since=2026-05-23T10:00:00.000Z`);
        const body = (await response.json()) as Record<string, unknown>;
        const data = body.data as Record<string, unknown>;

        expect(data.total).toBe(1);
        const returnedEntries = data.entries as Array<Record<string, unknown>>;
        expect(returnedEntries[0].message).toBe('after');
    });

    it('filters by code', async () => {
        const entries = [
            {
                timestamp: '2026-05-23T10:00:00.000Z',
                level: 'error',
                message: 'e1',
                code: 'E_CONSECUTIVE_ERRORS'
            },
            {
                timestamp: '2026-05-23T10:01:00.000Z',
                level: 'error',
                message: 'e2',
                code: 'E_OTHER'
            }
        ];
        temporaryLogFile = await writeTemporaryLog(entries);
        process.env.LOG_ERROR_FILE = temporaryLogFile;

        const response = await fetch(`${baseUrl}/logs/errors?code=E_CONSECUTIVE_ERRORS`);
        const body = (await response.json()) as Record<string, unknown>;
        const data = body.data as Record<string, unknown>;

        expect(data.total).toBe(1);
        const returnedEntries = data.entries as Array<Record<string, unknown>>;
        expect(returnedEntries[0].code).toBe('E_CONSECUTIVE_ERRORS');
    });

    it('respects the limit parameter', async () => {
        const entries = Array.from({ length: 10 }, (_, i) => ({
            timestamp: `2026-05-23T10:0${i}:00.000Z`,
            level: 'error',
            message: `error_${i}`
        }));
        temporaryLogFile = await writeTemporaryLog(entries);
        process.env.LOG_ERROR_FILE = temporaryLogFile;

        const response = await fetch(`${baseUrl}/logs/errors?limit=3`);
        const body = (await response.json()) as Record<string, unknown>;
        const data = body.data as Record<string, unknown>;

        expect((data.entries as unknown[]).length).toBe(3);
        expect(data.total).toBe(10);
    });

    it('returns 400 for an invalid since value', async () => {
        const response = await fetch(`${baseUrl}/logs/errors?since=not-a-date`);
        const body = (await response.json()) as Record<string, unknown>;

        expect(response.status).toBe(400);
        expect(body.success).toBe(false);
    });

    it('skips unparseable log lines silently', async () => {
        const temporaryFile = path.join(os.tmpdir(), `manna-test-malformed-${Date.now()}.log`);
        temporaryLogFile = temporaryFile;
        await fs.writeFile(
            temporaryFile,
            '{"timestamp":"2026-05-23T10:00:00.000Z","level":"error","message":"ok"}\nnot json\n\n',
            'utf-8'
        );
        process.env.LOG_ERROR_FILE = temporaryFile;

        const response = await fetch(`${baseUrl}/logs/errors`);
        const body = (await response.json()) as Record<string, unknown>;
        const data = body.data as Record<string, unknown>;

        expect(response.status).toBe(200);
        expect(data.total).toBe(1);
    });

    it('includes diagnostics.recentFiles in the response', async () => {
        temporaryLogFile = await writeTemporaryLog([]);
        process.env.LOG_ERROR_FILE = temporaryLogFile;

        const response = await fetch(`${baseUrl}/logs/errors`);
        const body = (await response.json()) as Record<string, unknown>;
        const data = body.data as Record<string, unknown>;

        expect(data.diagnostics).toBeDefined();
        const diag = data.diagnostics as Record<string, unknown>;
        expect(Array.isArray(diag.recentFiles)).toBe(true);
    });
});
