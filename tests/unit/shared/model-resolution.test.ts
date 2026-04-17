/**
 * Unit tests for packages/shared/model-resolution.ts
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveModel } from '@/packages/shared/model-resolution.js';

const MODEL_ENV_KEYS = [
    'AGENT_MODEL_FAST',
    'AGENT_MODEL_REASONING',
    'AGENT_MODEL_CODE',
    'OLLAMA_MODEL'
] as const;

describe('resolveModel', () => {
    const previous: Partial<Record<(typeof MODEL_ENV_KEYS)[number], string | undefined>> = {};

    beforeEach(() => {
        for (const key of MODEL_ENV_KEYS) {
            previous[key] = process.env[key];
            delete process.env[key];
        }
    });

    afterEach(() => {
        for (const key of MODEL_ENV_KEYS) {
            if (previous[key] === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = previous[key];
            }
        }
    });

    it('resolves profile-specific model first', () => {
        process.env.AGENT_MODEL_CODE = 'code-model';
        process.env.OLLAMA_MODEL = 'ollama-model';
        expect(resolveModel('code')).toBe('code-model');
    });

    it('falls back to OLLAMA_MODEL when profile var is unset', () => {
        process.env.OLLAMA_MODEL = 'ollama-model';
        expect(resolveModel('fast')).toBe('ollama-model');
        expect(resolveModel('reasoning')).toBe('ollama-model');
        expect(resolveModel('code')).toBe('ollama-model');
    });

    it('supports a preferredModel override', () => {
        process.env.AGENT_MODEL_CODE = 'code-model';
        expect(resolveModel('code', { preferredModel: 'tool-model' })).toBe('tool-model');
    });

    it('supports disabling OLLAMA fallback', () => {
        process.env.OLLAMA_MODEL = 'ollama-model';
        process.env.AGENT_MODEL_CODE = 'code-model';
        expect(resolveModel('code', { includeOllamaFallback: false })).toBe('code-model');
    });

    it('throws when no env vars are set (no hardcoded fallback)', () => {
        expect(() => resolveModel('code')).toThrow('Unable to resolve model for profile "code"');
        expect(() => resolveModel('fast')).toThrow('Unable to resolve model for profile "fast"');
        expect(() => resolveModel('reasoning')).toThrow(
            'Unable to resolve model for profile "reasoning"'
        );
    });

    it('throws when OLLAMA fallback is disabled and profile has no env var', () => {
        expect(() =>
            resolveModel('code', { includeOllamaFallback: false })
        ).toThrow('Unable to resolve model for profile "code"');
    });

    it('includes the env var name in the error message', () => {
        expect(() => resolveModel('code')).toThrow('AGENT_MODEL_CODE');
        expect(() => resolveModel('fast')).toThrow('AGENT_MODEL_FAST');
    });
});
