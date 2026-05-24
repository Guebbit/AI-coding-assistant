/**
 * Events endpoint — live SSE stream of normalized public observability events.
 *
 * Endpoint:
 * - `GET /events/stream` — opens an SSE connection that emits normalized
 *   public events derived from the in-process event bus in real time.
 *
 * Designed for monitoring dashboards, dev tools, and external UIs that
 * want a unified firehose of what Manna is doing.
 *
 * Each emitted frame uses a stable public envelope with:
 * - `timestamp`
 * - `requestId?`
 * - `runId?`
 * - `category`
 * - `type`
 * - `data`
 * - `metrics?`
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
import {
    createEventsStreamConnectedEvent,
    createEventsStreamHeartbeatEvent,
    normalizeEventsStreamEvent
} from './events-stream-contract';

/* ── Configuration ───────────────────────────────────────────────────── */

/** Heartbeat interval in milliseconds (keeps connection alive through proxies). */
const HEARTBEAT_INTERVAL_MS = 30_000;

/* ── Route registration ──────────────────────────────────────────────── */

/**
 * Register the `GET /events/stream` endpoint on the given Express app.
 *
 * Opens a persistent SSE connection that publishes normalized public events
 * derived from internal bus activity. Clients receive a stable event contract
 * suitable for dashboards and observability pipelines.
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
        const connected = createEventsStreamConnectedEvent(req.requestId);
        writeEvent(connected.eventType, connected.envelope);

        /* ── Event bus subscription (wildcard = everything) ──────────── */
        const handler = (event: IAgentEvent): void => {
            const normalized = normalizeEventsStreamEvent(event, req.requestId);
            writeEvent(normalized.eventType, normalized.envelope);
        };
        on('*', handler);

        /* ── Heartbeat to keep connection alive ─────────────────────── */
        const heartbeat = setInterval(() => {
            const pulse = createEventsStreamHeartbeatEvent(req.requestId);
            writeEvent(pulse.eventType, pulse.envelope);
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
