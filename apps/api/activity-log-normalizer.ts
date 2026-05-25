/**
 * Central translation layer from runtime/API events to activity-log records.
 *
 * @module apps/api/activity-log-normalizer
 */

import type { IAgentEvent } from '@/packages/events/bus';
import type { IActivityLogInput } from '@/packages/persistence/types';

const MAX_STRING_LENGTH = 8_000;
const MAX_ARRAY_ITEMS = 100;
const MAX_OBJECT_KEYS = 100;
const REDACTED_KEYS = new Set(['imageData', 'binary', 'buffer', 'rawBytes']);

export interface IApiActivityInput {
    kind: string;
    category?: string;
    type?: string;
    requestId?: string;
    conversationId?: string;
    messageId?: string;
    runId?: string;
    workflowId?: string;
    subtaskId?: string;
    parentId?: string;
    profile?: string;
    toolName?: string;
    status?: string;
    data?: Record<string, unknown>;
    meta?: Record<string, unknown>;
}

function toRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
}

function readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function sanitizeValue(value: unknown, depth = 0): unknown {
    if (depth > 6) return '[truncated_depth]';
    if (typeof value === 'string') {
        return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…` : value;
    }
    if (
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        value === null ||
        value === undefined
    ) {
        return value;
    }
    if (typeof value === 'bigint') return Number(value);
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) {
        return value.slice(0, MAX_ARRAY_ITEMS).map((entry) => sanitizeValue(entry, depth + 1));
    }
    if (typeof value === 'object') {
        return Object.entries(value as Record<string, unknown>)
            .slice(0, MAX_OBJECT_KEYS)
            .reduce<Record<string, unknown>>((accumulator, [key, nestedValue]) => {
                if (REDACTED_KEYS.has(key)) {
                    accumulator[key] = '[redacted]';
                    return accumulator;
                }
                accumulator[key] = sanitizeValue(nestedValue, depth + 1);
                return accumulator;
            }, {});
    }
    return String(value);
}

function splitKind(kind: string): { category: string; type: string } {
    const [category = 'system', type = 'event'] = kind.split(':');
    return { category, type };
}

function inferStatus(kind: string, payload: Record<string, unknown>): string | undefined {
    const explicitStatus = readString(payload.status);
    if (explicitStatus) return explicitStatus;

    if (kind.endsWith(':done')) return 'completed';
    if (kind.endsWith(':error')) return 'failed';
    if (kind === 'agent:max_steps') return 'max_steps';
    if (kind === 'agent:hard_stop') return 'hard_stop';
    if (kind.endsWith(':start')) return 'started';
    return undefined;
}

function inferToolName(payload: Record<string, unknown>): string | undefined {
    return readString(payload.tool) ?? readString(payload.toolName) ?? readString(payload.action);
}

/**
 * Normalize one internal event-bus event into an append-only activity-log document.
 */
export function normalizeBusEventToActivityLog(event: IAgentEvent): IActivityLogInput {
    const payload = toRecord(event.payload);
    const split = splitKind(event.type);
    const metrics = toRecord(payload.metrics);
    const meta = toRecord(payload.meta);

    return {
        timestamp: new Date(),
        kind: event.type,
        category: split.category,
        type: split.type,
        ...(readString(payload.conversationId) ? { conversationId: readString(payload.conversationId) } : {}),
        ...(readString(payload.messageId) ? { messageId: readString(payload.messageId) } : {}),
        ...(readString(payload.requestId) ? { requestId: readString(payload.requestId) } : {}),
        ...(readString(payload.runId) ? { runId: readString(payload.runId) } : {}),
        ...(readString(payload.workflowId) ? { workflowId: readString(payload.workflowId) } : {}),
        ...(readString(payload.subtaskId) ? { subtaskId: readString(payload.subtaskId) } : {}),
        ...(readString(payload.parentId) ? { parentId: readString(payload.parentId) } : {}),
        ...(readString(payload.profile) ? { profile: readString(payload.profile) } : {}),
        ...(inferToolName(payload) ? { toolName: inferToolName(payload) } : {}),
        ...(inferStatus(event.type, payload) ? { status: inferStatus(event.type, payload) } : {}),
        data: sanitizeValue(payload) as Record<string, unknown>,
        ...(Object.keys({ ...metrics, ...meta }).length > 0
            ? { meta: sanitizeValue({ ...meta, ...metrics }) as Record<string, unknown> }
            : {})
    };
}

/**
 * Normalize one API lifecycle signal into an append-only activity-log document.
 */
export function normalizeApiActivityToActivityLog(input: IApiActivityInput): IActivityLogInput {
    const split = splitKind(input.kind);
    return {
        timestamp: new Date(),
        kind: input.kind,
        category: input.category ?? split.category,
        type: input.type ?? split.type,
        ...(input.conversationId ? { conversationId: input.conversationId } : {}),
        ...(input.messageId ? { messageId: input.messageId } : {}),
        ...(input.requestId ? { requestId: input.requestId } : {}),
        ...(input.runId ? { runId: input.runId } : {}),
        ...(input.workflowId ? { workflowId: input.workflowId } : {}),
        ...(input.subtaskId ? { subtaskId: input.subtaskId } : {}),
        ...(input.parentId ? { parentId: input.parentId } : {}),
        ...(input.profile ? { profile: input.profile } : {}),
        ...(input.toolName ? { toolName: input.toolName } : {}),
        ...(input.status ? { status: input.status } : {}),
        data: sanitizeValue(input.data ?? {}) as Record<string, unknown>,
        ...(input.meta ? { meta: sanitizeValue(input.meta) as Record<string, unknown> } : {})
    };
}
