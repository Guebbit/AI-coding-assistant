/**
 * History endpoints — MongoDB-backed persistent activity-log API.
 *
 * @module apps/api/history-endpoints
 */

import type { Express, Request, Response } from 'express';
import {
    clearActivityLog,
    exportActivityLog,
    getActivityLogAvailability,
    listActivityLog
} from '@/packages/persistence/db';
import { buildResponseMeta, rejectResponse, successResponse } from '@/packages/shared';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const DEFAULT_LONG_POLL_TIMEOUT_MS = 30_000;
const DEFAULT_LONG_POLL_INTERVAL_MS = 750;
const MAX_LONG_POLL_TIMEOUT_MS = 120_000;

type HistoryQueryFilters = {
    kind?: string;
    category?: string;
    type?: string;
    conversationId?: string;
    messageId?: string;
    requestId?: string;
    runId?: string;
    workflowId?: string;
    subtaskId?: string;
    parentId?: string;
    profile?: string;
    toolName?: string;
    status?: string;
};

function parsePositiveInteger(raw: unknown, fallback: number, max?: number): number {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    const rounded = Math.floor(parsed);
    return typeof max === 'number' ? Math.min(rounded, max) : rounded;
}

function parseHistoryFilters(req: Request): HistoryQueryFilters {
    const keys: Array<keyof HistoryQueryFilters> = [
        'kind',
        'category',
        'type',
        'conversationId',
        'messageId',
        'requestId',
        'runId',
        'workflowId',
        'subtaskId',
        'parentId',
        'profile',
        'toolName',
        'status'
    ];
    return keys.reduce<HistoryQueryFilters>((accumulator, key) => {
        const raw = req.query[key];
        if (typeof raw === 'string' && raw.trim() !== '') accumulator[key] = raw.trim();
        return accumulator;
    }, {});
}

function ensureHistoryAvailable(res: Response): boolean {
    const availability = getActivityLogAvailability();
    if (availability.available) return true;
    rejectResponse(res, 503, 'Service Unavailable', [availability.reason ?? 'History unavailable']);
    return false;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isLongPollEnabled(): boolean {
    return process.env.HISTORY_LONG_POLL_ENABLED === 'true';
}

/**
 * Register the `/history` endpoints.
 */
export function registerHistoryRoutes(app: Express): void {
    app.get('/history', (req: Request, res: Response) => {
        const startedAt = new Date();
        if (!ensureHistoryAvailable(res)) return;

        const since = typeof req.query.since === 'string' ? req.query.since : undefined;
        const limit = parsePositiveInteger(req.query.limit, DEFAULT_LIMIT, MAX_LIMIT);
        const filters = parseHistoryFilters(req);

        listActivityLog({ since, limit, ...filters })
            .then((result) => {
                successResponse(
                    res,
                    {
                        entries: result.entries,
                        count: result.entries.length,
                        nextCursor: result.nextCursor,
                        hasMore: result.hasMore
                    },
                    200,
                    '',
                    buildResponseMeta(startedAt, req)
                );
            })
            .catch((error: unknown) => {
                rejectResponse(res, 400, 'Bad Request', [String(error)]);
            });
    });

    app.get('/history/export', (req: Request, res: Response) => {
        const startedAt = new Date();
        if (!ensureHistoryAvailable(res)) return;

        const since = typeof req.query.since === 'string' ? req.query.since : undefined;
        const filters = parseHistoryFilters(req);

        exportActivityLog({ since, ...filters })
            .then((entries) => {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.setHeader(
                    'Content-Disposition',
                    `attachment; filename="manna-history-${timestamp}.json"`
                );
                successResponse(
                    res,
                    {
                        exportedAt: new Date().toISOString(),
                        count: entries.length,
                        entries
                    },
                    200,
                    '',
                    buildResponseMeta(startedAt, req)
                );
            })
            .catch((error: unknown) => {
                rejectResponse(res, 400, 'Bad Request', [String(error)]);
            });
    });

    app.delete('/history', (req: Request, res: Response) => {
        const startedAt = new Date();
        if (!ensureHistoryAvailable(res)) return;

        const filters = parseHistoryFilters(req);

        clearActivityLog(filters)
            .then((deletedCount) => {
                if (deletedCount === null) {
                    rejectResponse(res, 503, 'Service Unavailable', ['History store unavailable']);
                    return;
                }
                successResponse(
                    res,
                    {
                        deletedCount,
                        scoped: Object.keys(filters).length > 0
                    },
                    200,
                    '',
                    buildResponseMeta(startedAt, req)
                );
            })
            .catch((error: unknown) => {
                rejectResponse(res, 400, 'Bad Request', [String(error)]);
            });
    });

    app.get('/history/poll', (req: Request, res: Response) => {
        const startedAt = new Date();

        if (!isLongPollEnabled()) {
            rejectResponse(res, 404, 'Not Found', [
                'History long-poll is disabled (set HISTORY_LONG_POLL_ENABLED=true to enable).'
            ]);
            return;
        }
        if (!ensureHistoryAvailable(res)) return;

        const since = typeof req.query.since === 'string' ? req.query.since : undefined;
        const limit = parsePositiveInteger(req.query.limit, DEFAULT_LIMIT, MAX_LIMIT);
        const timeoutMs = parsePositiveInteger(
            req.query.timeoutMs,
            parsePositiveInteger(
                process.env.HISTORY_LONG_POLL_TIMEOUT_MS,
                DEFAULT_LONG_POLL_TIMEOUT_MS,
                MAX_LONG_POLL_TIMEOUT_MS
            ),
            MAX_LONG_POLL_TIMEOUT_MS
        );
        const intervalMs = parsePositiveInteger(
            process.env.HISTORY_LONG_POLL_INTERVAL_MS,
            DEFAULT_LONG_POLL_INTERVAL_MS
        );
        const filters = parseHistoryFilters(req);
        const deadline = Date.now() + timeoutMs;

        const poll = (): ReturnType<typeof listActivityLog> =>
            listActivityLog({ since, limit, ...filters }).then((result) => {
                if (result.entries.length > 0 || Date.now() >= deadline) return result;
                return sleep(intervalMs).then(() => poll());
            });

        poll()
            .then((result) => {
                const timedOut = result.entries.length === 0;
                successResponse(
                    res,
                    {
                        entries: result.entries,
                        count: result.entries.length,
                        nextCursor: result.nextCursor,
                        hasMore: result.hasMore,
                        timedOut,
                        pollDurationMs: Date.now() - startedAt.getTime(),
                        pollTimeoutMs: timeoutMs
                    },
                    200,
                    '',
                    buildResponseMeta(startedAt, req)
                );
            })
            .catch((error: unknown) => {
                rejectResponse(res, 400, 'Bad Request', [String(error)]);
            });
    });
}
