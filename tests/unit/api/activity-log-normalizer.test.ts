import { describe, expect, it } from 'vitest';
import {
    normalizeApiActivityToActivityLog,
    normalizeBusEventToActivityLog
} from '@/apps/api/activity-log-normalizer';

describe('activity-log normalizer', () => {
    it('normalizes internal bus events with ids and metadata', () => {
        const normalized = normalizeBusEventToActivityLog({
            type: 'tool:error',
            payload: {
                runId: 'run-1',
                step: 3,
                tool: 'read_file',
                requestId: 'req-1',
                error: 'boom',
                metrics: { durationMs: 42 }
            }
        });

        expect(normalized.kind).toBe('tool:error');
        expect(normalized.category).toBe('tool');
        expect(normalized.type).toBe('error');
        expect(normalized.runId).toBe('run-1');
        expect(normalized.requestId).toBe('req-1');
        expect(normalized.toolName).toBe('read_file');
        expect(normalized.status).toBe('failed');
        expect(normalized.meta).toMatchObject({ durationMs: 42 });
    });

    it('normalizes API activities into activity-log shape', () => {
        const normalized = normalizeApiActivityToActivityLog({
            kind: 'api:run_completed',
            requestId: 'req-2',
            profile: 'code',
            status: 'completed',
            data: { answerLength: 120 }
        });

        expect(normalized.kind).toBe('api:run_completed');
        expect(normalized.category).toBe('api');
        expect(normalized.type).toBe('run_completed');
        expect(normalized.requestId).toBe('req-2');
        expect(normalized.profile).toBe('code');
        expect(normalized.status).toBe('completed');
        expect(normalized.data).toEqual({ answerLength: 120 });
    });

    it('redacts binary-ish payload fields', () => {
        const normalized = normalizeBusEventToActivityLog({
            type: 'agent:step',
            payload: {
                runId: 'run-2',
                imageData: 'base64-blob',
                parsed: { action: 'none', thought: 'ok' }
            }
        });

        expect(normalized.data).toMatchObject({
            runId: 'run-2',
            imageData: '[redacted]'
        });
    });
});
