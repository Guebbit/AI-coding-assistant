/**
 * Shared SSE (Server-Sent Events) helpers.
 *
 * The stream, swarm, and workflow endpoints each duplicated the same
 * `sseFrame` function, SSE header setup, and client-disconnect cleanup
 * pattern.  This module centralises all three.
 *
 * @module shared/sse
 */

import type { Request, Response } from 'express';

/** Maximum characters to include in SSE event data payloads. */
export const SSE_PAYLOAD_MAX_LENGTH = 300;

/**
 * Serialise an event as an SSE frame.
 *
 * @param eventType - The SSE event name.
 * @param data      - JSON-serialisable payload.
 * @returns A formatted SSE string ready to write to the response.
 */
export function sseFrame(eventType: string, data: unknown): string {
    return `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Set the standard SSE response headers and flush them to the client.
 *
 * @param res - Express response object.
 */
export function setupSSEHeaders(res: Response): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
}

/**
 * Register a client-disconnect handler that calls the provided
 * cleanup function when the SSE connection is closed.
 *
 * @param req     - Express request object.
 * @param cleanup - Function to invoke on disconnect (e.g. unsubscribe from events).
 */
export function onSSEClose(req: Request, cleanup: () => void): void {
    req.on('close', cleanup);
}

/**
 * Create a typed SSE write helper bound to a single response.
 * Eliminates the repeated `(eventType, data) => res.write(sseFrame(...))` pattern.
 */
export function createSseWriter(res: Response): (eventType: string, data: unknown) => void {
    return (eventType: string, data: unknown): void => {
        res.write(sseFrame(eventType, data));
    };
}
