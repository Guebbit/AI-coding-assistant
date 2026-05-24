/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class EventsService {
    /**
     * Live normalized SSE observability stream
     * Opens a persistent Server-Sent Events connection that forwards
     * normalized public events derived from the Manna in-process event bus.
     *
     * Designed for monitoring dashboards, developer tools, and external
     * UIs that want a unified live feed of what Manna is doing.
     *
     * **Public SSE event types** (stable contract):
     * - `stream.connected`
     * - `stream.heartbeat`
     * - `run.started`
     * - `run.step`
     * - `run.model_routed`
     * - `run.completed`
     * - `run.failed`
     * - `run.max_steps`
     * - `run.hard_stop`
     * - `tool.succeeded`
     * - `tool.failed`
     * - `tool.verification_failed`
     * - `swarm.started`
     * - `swarm.decomposed`
     * - `swarm.subtask_started`
     * - `swarm.subtask_completed`
     * - `swarm.subtask_failed`
     * - `swarm.completed`
     * - `system.event` (fallback for unknown internal event types)
     *
     * **Envelope shape (all events):**
     * - `timestamp` (ISO date-time)
     * - `requestId?` (stream request correlation id)
     * - `runId?` (agent run correlation id when available)
     * - `category` (`stream | run | tool | swarm | system`)
     * - `type` (public subtype, e.g. `step`, `completed`, `failed`)
     * - `data` (normalized event payload)
     * - `metrics?` (timing, tokens, context, step/tool counters, citations)
     *
     * The connection stays open indefinitely until the client disconnects.
     *
     * @returns string SSE stream opened — events arrive continuously.
     * @throws ApiError
     */
    public static getEventsStream(): CancelablePromise<string> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/events/stream',
        });
    }
}
