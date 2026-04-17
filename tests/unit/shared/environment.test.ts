/**
 * Unit tests for packages/shared/environment.ts
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    validateRequiredEnvironment,
    validateRecommendedEnvironment
} from '@/packages/shared/environment.js';

describe('validateRequiredEnvironment', () => {
    afterEach(() => {
        delete process.env.OLLAMA_MODEL;
    });

    it('throws when OLLAMA_MODEL is missing', () => {
        delete process.env.OLLAMA_MODEL;
        expect(() => validateRequiredEnvironment()).toThrow('OLLAMA_MODEL');
    });

    it('throws when OLLAMA_MODEL is empty', () => {
        process.env.OLLAMA_MODEL = '   ';
        expect(() => validateRequiredEnvironment()).toThrow('OLLAMA_MODEL');
    });

    it('does not throw when OLLAMA_MODEL is set', () => {
        process.env.OLLAMA_MODEL = 'llama3.1:8b';
        expect(() => validateRequiredEnvironment()).not.toThrow();
    });
});

describe('validateRecommendedEnvironment', () => {
    afterEach(() => {
        delete process.env.OLLAMA_BASE_URL;
        delete process.env.OLLAMA_EMBED_MODEL;
        delete process.env.AGENT_MODEL_FAST;
        delete process.env.AGENT_MODEL_REASONING;
        delete process.env.AGENT_MODEL_CODE;
    });

    it('warns when recommended variables are missing', () => {
        const warn = vi.fn();
        validateRecommendedEnvironment({ warn });
        expect(warn).toHaveBeenCalledWith(
            'missing_recommended_env_vars',
            expect.objectContaining({
                missing: expect.arrayContaining(['OLLAMA_BASE_URL', 'OLLAMA_EMBED_MODEL'])
            })
        );
    });

    it('does not warn when recommended variables are present', () => {
        process.env.OLLAMA_BASE_URL = 'http://localhost:11434';
        process.env.OLLAMA_EMBED_MODEL = 'nomic-embed-text';
        process.env.AGENT_MODEL_FAST = 'llama3.1:8b';
        process.env.AGENT_MODEL_REASONING = 'deepseek-r1:32b';
        process.env.AGENT_MODEL_CODE = 'qwen2.5-coder:14b';
        const warn = vi.fn();
        validateRecommendedEnvironment({ warn });
        expect(warn).not.toHaveBeenCalled();
    });
});
