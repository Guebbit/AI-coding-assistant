/**
 * Unit tests for packages/shared/environment.ts
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    validateRequiredEnvironment,
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
        process.env.OLLAMA_BASE_URL = 'http://localhost:11434';
        process.env.OLLAMA_EMBED_MODEL = 'nomic-embed-text:latest';
        process.env.AGENT_MODEL_FAST = 'llama3.1:8b';
        process.env.AGENT_MODEL_REASONING = 'llama3.1:8b';
        process.env.AGENT_MODEL_CODE = 'llama3.1:8b';
        expect(() => validateRequiredEnvironment()).not.toThrow();
    });
});
