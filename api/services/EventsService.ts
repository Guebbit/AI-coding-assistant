/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class EventsService {
    /**
     * Live SSE stream of all internal events
     * Opens a persistent Server-Sent Events connection that forwards
     * **every** event emitted on the Manna in-process event bus.
     *
     * Designed for monitoring dashboards, developer tools, and external
     * UIs that want a unified live feed of everything Manna is doing.
     *
     * **SSE event types** (mirror the internal bus types):
     * - `connected`         — sent immediately on connect: `{ message, timestamp }`
     * - `heartbeat`         — sent every ~30 s to keep the connection alive: `{ timestamp }`
     * - `agent:start`       — agent run started: `{ task }`
     * - `agent:step`        — agent completed a reasoning step: `{ step, parsed: { thought, action } }`
     * - `agent:done`        — agent run finished: `{ answer, citations, meta }`
     * - `agent:error`       — agent run failed: `{ error }`
     * - `agent:max_steps`   — step limit reached: `{ task, summary, diagnosticFile? }`
     * - `agent:hard_stop`   — policy hard stop: `{ step, code, reason }`
     * - `agent:model_routed`— model profile selected: `{ profile, model, reason }`
     * - `tool:result`       — tool executed successfully: `{ tool, result }`
     * - `tool:error`        — tool execution failed: `{ tool, error }`
     * - `swarm:decomposed`  — swarm task decomposed: `{ subtasks }`
     * - `swarm:subtask_start` — swarm subtask started: `{ index, task }`
     * - `swarm:subtask_done`  — swarm subtask completed: `{ index, result }`
     * - `swarm:subtask_error` — swarm subtask failed: `{ index, error }`
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
