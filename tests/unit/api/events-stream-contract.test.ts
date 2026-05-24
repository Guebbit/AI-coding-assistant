/**
 * Unit tests for apps/api/events-stream-contract.ts
 */

import { describe, expect, it } from 'vitest';
import {
    createEventsStreamConnectedEvent,
    createEventsStreamHeartbeatEvent,
    normalizeEventsStreamEvent
} from '@/apps/api/events-stream-contract';

describe('events stream public contract', () => {
    it('normalizes connected and heartbeat lifecycle events', () => {
        const connected = createEventsStreamConnectedEvent('req-1');
        const heartbeat = createEventsStreamHeartbeatEvent('req-1');

        expect(connected.eventType).toBe('stream.connected');
        expect(connected.envelope.category).toBe('stream');
        expect(connected.envelope.type).toBe('connected');
        expect(connected.envelope.requestId).toBe('req-1');

        expect(heartbeat.eventType).toBe('stream.heartbeat');
        expect(heartbeat.envelope.category).toBe('stream');
        expect(heartbeat.envelope.type).toBe('heartbeat');
    });

    it('normalizes agent step events and extracts metrics', () => {
        const frame = normalizeEventsStreamEvent(
            {
                type: 'agent:step',
                payload: {
                    runId: 'run-1',
                    step: 2,
                    parsed: { action: 'read_file', thought: 'Reading' },
                    metrics: { stepDurationMs: 42, contextLength: 1234, durationMs: 21 }
                }
            },
            'req-1'
        );

        expect(frame.eventType).toBe('run.step');
        expect(frame.envelope.runId).toBe('run-1');
        expect(frame.envelope.data).toEqual({
            step: 2,
            action: 'read_file',
            thought: 'Reading'
        });
        expect(frame.envelope.metrics).toMatchObject({
            step: 2,
            stepDurationMs: 42,
            contextLength: 1234,
            durationMs: 21
        });
    });

    it('normalizes completion events and derives token/citation metrics from meta', () => {
        const frame = normalizeEventsStreamEvent({
            type: 'agent:done',
            payload: {
                runId: 'run-2',
                thought: 'Done',
                citations: [{ title: 'Doc' }],
                meta: {
                    durationMs: 1000,
                    promptTokens: 10,
                    completionTokens: 20,
                    totalTokens: 30,
                    contextLength: 500,
                    steps: 3,
                    toolCalls: 2,
                    memoryUsed: true,
                    citations: [{ title: 'Doc' }]
                }
            }
        });

        expect(frame.eventType).toBe('run.completed');
        expect(frame.envelope.metrics).toMatchObject({
            durationMs: 1000,
            promptTokens: 10,
            completionTokens: 20,
            totalTokens: 30,
            contextLength: 500,
            steps: 3,
            toolCalls: 2,
            memoryUsed: true,
            citationsCount: 1
        });
    });
});
