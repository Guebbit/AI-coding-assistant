/**
 * Unit tests for packages/shared/response.ts
 */

import { describe, expect, it } from 'vitest';
import { generateReject, generateSuccess } from '../../../packages/shared/response.js';

describe('generateSuccess', () => {
    it('builds a success envelope with defaults', () => {
        expect(generateSuccess({ value: 1 })).toEqual({
            success: true,
            status: 200,
            message: '',
            data: { value: 1 },
            meta: undefined
        });
    });

    it('includes meta when provided', () => {
        expect(
            generateSuccess({ value: 1 }, 200, '', {
                durationMs: 42,
                startedAt: '2026-01-01T00:00:00.000Z'
            })
        ).toEqual({
            success: true,
            status: 200,
            message: '',
            data: { value: 1 },
            meta: {
                durationMs: 42,
                startedAt: '2026-01-01T00:00:00.000Z'
            }
        });
    });
});

describe('generateReject', () => {
    it('builds a rejection envelope with supplied errors', () => {
        expect(generateReject(400, 'Bad Request', ['invalid input'])).toEqual({
            success: false,
            status: 400,
            message: 'Bad Request',
            errors: ['invalid input']
        });
    });
});
