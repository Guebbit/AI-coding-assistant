/**
 * Events endpoint — live SSE stream of ALL internal bus events.
 *
 * Endpoint:
 * - `GET /events/stream` — opens an SSE connection that forwards every
 *   event emitted on the in-process event bus in real time.
 *
 * Designed for monitoring dashboards, dev tools, and external UIs that
 * want a unified firehose of what Manna is doing.
 *
 * Emitted SSE event types mirror the bus event type verbatim
 * (e.g. `agent:step`, `tool:result`, `agent:hard_stop`, etc.).
 * The `data` payload is the raw event payload JSON-serialised.
 *
 * An initial `connected` event is sent immediately so clients know
 * the stream is alive.  A periodic `heartbeat` event (every 30 s)
 * keeps the connection open through proxies.
 *
 * @module apps/api/events-endpoints
 */

import type { Express, Request, Response } from 'express';
import { on, off } from '@/packages/events/bus';
import type { IAgentEvent } from '@/packages/events/bus';
import { logger } from '@/packages/logger/logger';
import { setupSSEHeaders, createSseWriter, onSSEClose } from '@/packages/shared';

/* ── Configuration ───────────────────────────────────────────────────── */

/** Heartbeat interval in milliseconds (keeps connection alive through proxies). */
const HEARTBEAT_INTERVAL_MS = 30_000;

/* ── Route registration ──────────────────────────────────────────────── */

/**
 * Register the `GET /events/stream` endpoint on the given Express app.
 *
 * Opens a persistent SSE connection that forwards every event from the
 * in-process event bus.  Clients receive a live firehose of all agent,
 * tool, swarm, and system events — suitable for dashboards and dev UIs.
 *
 * @param app - Express application instance.
 */
export function registerEventsRoutes(app: Express): void {
    app.get('/events/stream', (req: Request, res: Response) => {
        logger.info('events_stream_connected', {
            component: 'api.events',
            requestId: req.requestId,
        });

        /* ── SSE setup ───────────────────────────────────────────────── */
        setupSSEHeaders(res);
        const writeEvent = createSseWriter(res);

        /* Notify the client the stream is alive. */
        writeEvent('connected', {
            message: 'Event stream active',
            timestamp: new Date().toISOString(),
        });

        /* ── Event bus subscription (wildcard = everything) ──────────── */
        const handler = (event: IAgentEvent): void => {
            writeEvent(event.type, event.payload);
        };
        on('*', handler);

        /* ── Heartbeat to keep connection alive ─────────────────────── */
        const heartbeat = setInterval(() => {
            writeEvent('heartbeat', { timestamp: new Date().toISOString() });
        }, HEARTBEAT_INTERVAL_MS);

        /* ── Cleanup on client disconnect ────────────────────────────── */
        const cleanup = (): void => {
            clearInterval(heartbeat);
            off('*', handler);
            logger.info('events_stream_disconnected', {
                component: 'api.events',
                requestId: req.requestId,
            });
        };

        onSSEClose(req, cleanup);
    });
}
