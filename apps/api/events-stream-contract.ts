/**
 * Public SSE contract for `GET /events/stream`.
 *
 * Converts internal bus events into a stable, documented envelope suitable
 * for dashboards and observability clients.
 *
 * @module apps/api/events-stream-contract
 */

import type { IAgentEvent } from '@/packages/events/bus';

/**
 * Normalized category used by the public `/events/stream` envelope.
 */
export type PublicEventsStreamCategory = 'stream' | 'run' | 'tool' | 'swarm' | 'system';

/**
 * Metrics extracted (when available) from internal events.
 */
export interface IEventsStreamMetrics {
    /** Full run duration in milliseconds. */
    durationMs?: number;
    /** Per-step duration in milliseconds. */
    stepDurationMs?: number;
    /** Tool execution duration in milliseconds. */
    toolDurationMs?: number;
    /** Prompt/input token count. */
    promptTokens?: number;
    /** Completion/output token count. */
    completionTokens?: number;
    /** Total token count. */
    totalTokens?: number;
    /** Context length in characters. */
    contextLength?: number;
    /** Step index for the related event. */
    step?: number;
    /** Total executed agent steps in the run. */
    steps?: number;
    /** Total tool calls in the run. */
    toolCalls?: number;
    /** Whether semantic memory was used. */
    memoryUsed?: boolean;
    /** Number of memories loaded for the run. */
    memoryCount?: number;
    /** Number of citations emitted/collected. */
    citationsCount?: number;
}

/**
 * Stable public SSE envelope returned by `GET /events/stream`.
 */
export interface IEventsStreamEnvelope {
    /** ISO timestamp for when this public event was emitted by the API. */
    timestamp: string;
    /** Request correlation ID of the stream connection (when available). */
    requestId?: string;
    /** Run correlation ID (when available from the source event). */
    runId?: string;
    /** High-level event grouping for consumers. */
    category: PublicEventsStreamCategory;
    /** Stable public event subtype. */
    type: string;
    /** Event-specific normalized payload data. */
    data: Record<string, unknown>;
    /** Optional observability metrics extracted from source events. */
    metrics?: IEventsStreamMetrics;
}

/**
 * Serialized public event frame for SSE writing.
 */
export interface IPublicSseFrame {
    /** Top-level SSE event name. */
    eventType: string;
    /** Public envelope payload. */
    envelope: IEventsStreamEnvelope;
}

interface IEventMapping {
    eventType: string;
    category: PublicEventsStreamCategory;
    type: string;
}

const EVENT_MAPPING: Record<string, IEventMapping> = {
    'agent:start': { eventType: 'run.started', category: 'run', type: 'started' },
    'agent:step': { eventType: 'run.step', category: 'run', type: 'step' },
    'agent:done': { eventType: 'run.completed', category: 'run', type: 'completed' },
    'agent:error': { eventType: 'run.failed', category: 'run', type: 'failed' },
    'agent:max_steps': { eventType: 'run.max_steps', category: 'run', type: 'max_steps' },
    'agent:hard_stop': { eventType: 'run.hard_stop', category: 'run', type: 'hard_stop' },
    'agent:model_routed': { eventType: 'run.model_routed', category: 'run', type: 'model_routed' },
    'tool:result': { eventType: 'tool.succeeded', category: 'tool', type: 'succeeded' },
    'tool:error': { eventType: 'tool.failed', category: 'tool', type: 'failed' },
    'tool:verification_failed': {
        eventType: 'tool.verification_failed',
        category: 'tool',
        type: 'verification_failed'
    },
    'swarm:start': { eventType: 'swarm.started', category: 'swarm', type: 'started' },
    'swarm:decomposed': { eventType: 'swarm.decomposed', category: 'swarm', type: 'decomposed' },
    'swarm:subtask_start': {
        eventType: 'swarm.subtask_started',
        category: 'swarm',
        type: 'subtask_started'
    },
    'swarm:subtask_done': {
        eventType: 'swarm.subtask_completed',
        category: 'swarm',
        type: 'subtask_completed'
    },
    'swarm:subtask_error': {
        eventType: 'swarm.subtask_failed',
        category: 'swarm',
        type: 'subtask_failed'
    },
    'swarm:done': { eventType: 'swarm.completed', category: 'swarm', type: 'completed' }
};

/**
 * Build the normalized `connected` lifecycle event for `/events/stream`.
 *
 * @param requestId - Stream connection request ID.
 * @returns Serialized SSE frame with a normalized envelope.
 */
export function createEventsStreamConnectedEvent(requestId?: string): IPublicSseFrame {
    return {
        eventType: 'stream.connected',
        envelope: {
            timestamp: new Date().toISOString(),
            requestId,
            category: 'stream',
            type: 'connected',
            data: { message: 'Event stream active' }
        }
    };
}

/**
 * Build the normalized `heartbeat` lifecycle event for `/events/stream`.
 *
 * @param requestId - Stream connection request ID.
 * @returns Serialized SSE frame with a normalized envelope.
 */
export function createEventsStreamHeartbeatEvent(requestId?: string): IPublicSseFrame {
    return {
        eventType: 'stream.heartbeat',
        envelope: {
            timestamp: new Date().toISOString(),
            requestId,
            category: 'stream',
            type: 'heartbeat',
            data: {}
        }
    };
}

/**
 * Normalize one internal bus event into the public `/events/stream` contract.
 *
 * @param event - Internal bus event.
 * @param requestId - Stream connection request ID.
 * @returns Serialized SSE frame with stable event name + public envelope.
 */
export function normalizeEventsStreamEvent(event: IAgentEvent, requestId?: string): IPublicSseFrame {
    const mapping = EVENT_MAPPING[event.type] ?? {
        eventType: 'system.event',
        category: 'system' as const,
        type: 'event'
    };
    const payload = toRecord(event.payload);
    const runId = readString(payload.runId);
    const metrics = extractMetrics(event.type, payload);

    return {
        eventType: mapping.eventType,
        envelope: {
            timestamp: new Date().toISOString(),
            requestId,
            runId,
            category: mapping.category,
            type: mapping.type,
            data: normalizeEventData(event.type, payload),
            ...(metrics ? { metrics } : {})
        }
    };
}

function normalizeEventData(eventType: string, payload: Record<string, unknown>): Record<string, unknown> {
    switch (eventType) {
        case 'agent:start':
            return pickDefined(payload, ['task', 'startedAt']);
        case 'agent:step': {
            const parsed = toRecord(payload.parsed);
            return {
                ...pickDefined(payload, ['step']),
                action: readString(parsed.action),
                thought: readString(parsed.thought)
            };
        }
        case 'agent:done':
            return Array.isArray(payload.citations)
                ? { ...pickDefined(payload, ['thought', 'summary', 'status']), citations: payload.citations }
                : pickDefined(payload, ['thought', 'summary', 'status']);
        case 'agent:error':
            return pickDefined(payload, ['step', 'error']);
        case 'agent:max_steps':
            return pickDefined(payload, ['task', 'summary', 'diagnosticFile']);
        case 'agent:hard_stop':
            return pickDefined(payload, ['step', 'code', 'reason']);
        case 'agent:model_routed':
            return pickDefined(payload, ['step', 'profile', 'model', 'reason']);
        case 'tool:result':
            return pickDefined(payload, ['step', 'tool', 'result']);
        case 'tool:error':
            return pickDefined(payload, ['step', 'tool', 'error', 'errorCode']);
        default:
            return payload;
    }
}

function extractMetrics(eventType: string, payload: Record<string, unknown>): IEventsStreamMetrics | undefined {
    const metricsFromPayload = toRecord(payload.metrics);
    const meta = toRecord(payload.meta);
    const metrics: IEventsStreamMetrics = {
        durationMs:
            readNumber(payload.durationMs) ??
            readNumber(payload.totalDurationMs) ??
            readNumber(metricsFromPayload.durationMs) ??
            readNumber(meta.durationMs),
        stepDurationMs:
            readNumber(payload.stepDurationMs) ?? readNumber(metricsFromPayload.stepDurationMs),
        toolDurationMs:
            eventType.startsWith('tool:')
                ? readNumber(payload.durationMs) ??
                  readNumber(payload.toolDurationMs) ??
                  readNumber(metricsFromPayload.toolDurationMs)
                : undefined,
        promptTokens:
            readNumber(payload.promptTokens) ??
            readNumber(metricsFromPayload.promptTokens) ??
            readNumber(meta.promptTokens),
        completionTokens:
            readNumber(payload.completionTokens) ??
            readNumber(metricsFromPayload.completionTokens) ??
            readNumber(meta.completionTokens),
        totalTokens:
            readNumber(payload.totalTokens) ??
            readNumber(metricsFromPayload.totalTokens) ??
            readNumber(meta.totalTokens),
        contextLength:
            readNumber(payload.contextLength) ??
            readNumber(metricsFromPayload.contextLength) ??
            readNumber(meta.contextLength),
        step: readNumber(payload.step) ?? readNumber(metricsFromPayload.step),
        steps: readNumber(payload.steps) ?? readNumber(metricsFromPayload.steps) ?? readNumber(meta.steps),
        toolCalls:
            readNumber(payload.toolCalls) ??
            readNumber(metricsFromPayload.toolCalls) ??
            readNumber(meta.toolCalls),
        memoryUsed:
            readBoolean(payload.memoryUsed) ??
            readBoolean(metricsFromPayload.memoryUsed) ??
            readBoolean(meta.memoryUsed),
        memoryCount: readNumber(payload.memoryCount) ?? readNumber(metricsFromPayload.memoryCount),
        citationsCount:
            readNumber(payload.citationsCount) ??
            readNumber(metricsFromPayload.citationsCount) ??
            (Array.isArray(payload.citations) ? payload.citations.length : undefined) ??
            (Array.isArray(meta.citations) ? meta.citations.length : undefined)
    };

    return Object.values(metrics).some((value) => value !== undefined) ? metrics : undefined;
}

function pickDefined(
    payload: Record<string, unknown>,
    keys: string[]
): Record<string, unknown> {
    return keys.reduce<Record<string, unknown>>((accumulator, key) => {
        if (payload[key] !== undefined) accumulator[key] = payload[key];
        return accumulator;
    }, {});
}

function toRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
}

function readString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
    return typeof value === 'number' ? value : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
}
