/**
 * Logs endpoint — read-only access to the structured error log.
 *
 * Endpoint:
 * - `GET /logs/errors` — return recent error-level log entries, optionally
 *   filtered by component, requestId, error code, or timestamp.
 *
 * The file read is controlled by `LOG_ERROR_FILE` (default `"error.log"`).
 * Each line is expected to be a JSON object (Winston's default json format).
 * Lines that cannot be parsed are silently skipped.
 *
 * Query parameters:
 * - `limit`     (number, default 100, max 500)   — max entries to return.
 * - `component` (string)                          — filter by `component` field.
 * - `requestId` (string)                          — filter by `requestId` field.
 * - `code`      (string)                          — filter by `code` field.
 * - `since`     (ISO 8601 string)                 — return entries after this timestamp.
 *
 * @module apps/api/logs-endpoints
 */

import fs from 'fs/promises';
import path from 'path';
import type { Express, Request, Response } from 'express';
import { logger } from '@/packages/logger/logger';
import { rejectResponse, successResponse, buildResponseMeta } from '@/packages/shared';

/* ── Configuration ───────────────────────────────────────────────────── */

/** Path to the error-only Winston log file (read at request time). */
function getLogErrorFile(): string {
    return process.env.LOG_ERROR_FILE ?? 'error.log';
}

/** Directory where per-run diagnostic Markdown files are written (read at request time). */
function getDiagnosticLogDir(): string {
    return process.env.DIAGNOSTIC_LOG_DIR ?? 'data/diagnostics';
}

/** Hard cap on returned entries to avoid unbounded reads. */
const MAX_LIMIT = 500;

/** Default maximum returned entries when `limit` is not supplied. */
const DEFAULT_LIMIT = 100;

/* ── Types ───────────────────────────────────────────────────────────── */

/** A single parsed error-log entry (subset of Winston json output). */
interface ILogEntry {
    timestamp?: string;
    level?: string;
    message?: string;
    component?: string;
    requestId?: string;
    code?: string;
    [key: string]: unknown;
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

/**
 * Try to parse a single log line as JSON.
 * Returns `null` when the line is empty or not valid JSON.
 */
function parseLine(line: string): ILogEntry | null {
    const trimmed = line.trim();
    if (!trimmed) return null;
    try {
        return JSON.parse(trimmed) as ILogEntry;
    } catch {
        return null;
    }
}

/**
 * Read `LOG_ERROR_FILE` and return all parseable JSON entries.
 * Returns an empty array when the file does not exist.
 */
function readLogEntries(): Promise<ILogEntry[]> {
    const absPath = path.resolve(process.cwd(), getLogErrorFile());

    return fs
        .readFile(absPath, 'utf-8')
        .then((raw) =>
            raw
                .split('\n')
                .map(parseLine)
                .filter((e): e is ILogEntry => e !== null)
        )
        .catch((error: NodeJS.ErrnoException) => {
            /* File not yet written (no errors logged yet) is expected. */
            if (error.code === 'ENOENT') return [];
            throw error;
        });
}

/**
 * List recent diagnostic Markdown file names (basename only) sorted newest first.
 * Returns an empty array when the directory does not exist.
 */
function recentDiagnosticFiles(maxFiles = 10): Promise<string[]> {
    const absDir = path.resolve(process.cwd(), getDiagnosticLogDir());

    return fs
        .readdir(absDir)
        .then((names) =>
            names
                .filter((n) => n.endsWith('.md'))
                .sort()
                .reverse()
                .slice(0, maxFiles)
        )
        .catch((error: NodeJS.ErrnoException) => {
            if (error.code === 'ENOENT') return [];
            throw error;
        });
}

/* ── Route registration ──────────────────────────────────────────────── */

/**
 * Register the `GET /logs/errors` endpoint on the given Express app.
 *
 * @param app - Express application instance.
 */
export function registerLogsRoutes(app: Express): void {
    /**
     * GET /logs/errors
     *
     * Returns recent error-level log entries from `LOG_ERROR_FILE` in the
     * standard response envelope.  Supports request-level filtering and an
     * optional diagnostics reference list.
     */
    app.get('/logs/errors', (req: Request, res: Response) => {
        const startedAt = new Date();

        /* ── Parse and validate query params ─────────────────────────── */
        const rawLimit = Number(req.query.limit ?? DEFAULT_LIMIT);
        const limit = Number.isFinite(rawLimit) && rawLimit > 0
            ? Math.min(rawLimit, MAX_LIMIT)
            : DEFAULT_LIMIT;

        const filterComponent = typeof req.query.component === 'string'
            ? req.query.component
            : undefined;
        const filterRequestId = typeof req.query.requestId === 'string'
            ? req.query.requestId
            : undefined;
        const filterCode = typeof req.query.code === 'string'
            ? req.query.code
            : undefined;
        const filterSince = typeof req.query.since === 'string'
            ? req.query.since
            : undefined;

        /* Validate `since` when present. */
        if (filterSince !== undefined && Number.isNaN(Date.parse(filterSince))) {
            rejectResponse(res, 400, 'Bad Request', [
                '`since` must be a valid ISO 8601 timestamp'
            ]);
            return;
        }

        logger.info('logs_errors_requested', {
            component: 'api.logs',
            requestId: req.requestId,
            limit,
            filterComponent,
            filterRequestId,
            filterCode,
            filterSince,
        });

        /* ── Read entries + recent diagnostic file list in parallel ──── */
        Promise.all([readLogEntries(), recentDiagnosticFiles()])
            .then(([allEntries, diagnosticFiles]) => {
                /* Apply filters (most-selective first). */
                let filtered = allEntries;

                if (filterSince !== undefined) {
                    const sinceMs = Date.parse(filterSince);
                    filtered = filtered.filter(
                        (e) => typeof e.timestamp === 'string' && Date.parse(e.timestamp) > sinceMs
                    );
                }
                if (filterComponent !== undefined) {
                    filtered = filtered.filter((e) => e.component === filterComponent);
                }
                if (filterRequestId !== undefined) {
                    filtered = filtered.filter((e) => e.requestId === filterRequestId);
                }
                if (filterCode !== undefined) {
                    filtered = filtered.filter((e) => e.code === filterCode);
                }

                /* Newest first, then cap at `limit`. */
                const entries = filtered.reverse().slice(0, limit);

                successResponse(
                    res,
                    {
                        entries,
                        total: filtered.length,
                        logFile: getLogErrorFile(),
                        diagnostics: { recentFiles: diagnosticFiles },
                    },
                    200,
                    '',
                    buildResponseMeta(startedAt, req)
                );
            })
            .catch((error: unknown) => {
                logger.error('logs_errors_failed', {
                    component: 'api.logs',
                    requestId: req.requestId,
                    error: String(error),
                });
                rejectResponse(res, 500, 'Internal Server Error', [String(error)]);
            });
    });
}
