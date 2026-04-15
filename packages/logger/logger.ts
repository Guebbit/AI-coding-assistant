/**
 * Centralised logging configuration built on Winston.
 *
 * Provides a single root logger instance used across the service.
 * All output goes to the console — structured JSON by default, or a
 * colorised human-readable format when `LOG_PRETTY=true`.
 *
 * Environment variables:
 * - `LOG_ENABLED` (`true`/`false`, default `true`) — master kill-switch.
 * - `LOG_LEVEL`   (default `"info"`) — minimum severity to emit.
 * - `LOG_PRETTY`      (`true`/`false`, default `false`) — toggle human-readable output.
 * - `LOG_ERROR_FILE`  (default `"error.log"`) — destination file for error-level logs.
 *
 * @module logger/logger
 */

import { createLogger, format, transports } from 'winston';

/**
 * Parse a string environment variable as a boolean.
 *
 * Treats the literal string `"true"` (case-insensitive) as `true`;
 * everything else — including `undefined` — falls back to
 * `defaultValue`.
 *
 * @param value        - Raw env var value (may be `undefined`).
 * @param defaultValue - Fallback when the variable is not set.
 * @returns The parsed boolean.
 */
function asBoolean(value: string | undefined, defaultValue: boolean): boolean {
    if (value === undefined) {
        return defaultValue;
    }

    return value.toLowerCase() === 'true';
}

/* ── Resolved configuration from environment ─────────────────────────── */

/** Whether logging is globally enabled. */
const LOG_ENABLED = asBoolean(process.env.LOG_ENABLED, true);

/** Minimum log severity (e.g. `"info"`, `"debug"`, `"warn"`). */
const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info';

/** When `true`, logs are human-readable; otherwise JSON lines. */
const LOG_PRETTY = asBoolean(process.env.LOG_PRETTY, false);

/** File path used by the error-only file transport. */
const LOG_ERROR_FILE = process.env.LOG_ERROR_FILE ?? 'error.log';

/* ── Format definitions ──────────────────────────────────────────────── */

/** Structured JSON format — one JSON object per log line. */
const jsonFormat = format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
);

/** Colourised, human-readable format for local development. */
const prettyFormat = format.combine(
    format.colorize(),
    format.timestamp(),
    format.printf(({ timestamp, level, message, ...meta }) => {
        const details = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
        return `${timestamp} ${level}: ${message}${details}`;
    })
);

/* ── Root logger instance ────────────────────────────────────────────── */

/**
 * Root Winston logger shared across the entire application.
 *
 * Callers should include an explicit `component` metadata field on each
 * log call so every log line remains traceable to a subsystem.
 */
export const logger = createLogger({
    level: LOG_LEVEL,
    silent: !LOG_ENABLED,
    defaultMeta: { service: 'manna' },
    format: LOG_PRETTY ? prettyFormat : jsonFormat,
    transports: [
        new transports.Console(),
        new transports.File({
            level: 'error',
            filename: LOG_ERROR_FILE
        })
    ]
});
