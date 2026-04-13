/**
 * Centralised logging configuration built on Winston.
 *
 * Provides a single root logger and a factory (`getLogger`) that
 * creates per-component child loggers. All output goes to the
 * console — structured JSON by default, or a colorised
 * human-readable format when `LOG_PRETTY=true`.
 *
 * Environment variables:
 * - `LOG_ENABLED` (`true`/`false`, default `true`) — master kill-switch.
 * - `LOG_LEVEL`   (default `"info"`) — minimum severity to emit.
 * - `LOG_PRETTY`  (`true`/`false`, default `false`) — toggle human-readable output.
 *
 * @module logger/logger
 */

import { createLogger, format, transports, type Logger } from 'winston';

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
 * Direct use is discouraged — prefer `getLogger("component-name")` so
 * that every log line carries a `component` metadata field for easy
 * filtering.
 */
export const logger = createLogger({
    level: LOG_LEVEL,
    silent: !LOG_ENABLED,
    defaultMeta: { service: 'ai-assistant' },
    format: LOG_PRETTY ? prettyFormat : jsonFormat,
    transports: [new transports.Console()]
});

/**
 * Create a child logger scoped to a specific component.
 *
 * The returned logger automatically injects `{ component }` into every
 * log entry, making it trivial to filter by subsystem in production.
 *
 * @param component - Short identifier for the subsystem (e.g. `"agent"`, `"memory"`).
 * @returns A Winston `Logger` instance with the component metadata attached.
 */
export function getLogger(component: string): Logger {
    return logger.child({ component });
}
