/**
 * Unit tests for packages/shared/environment.ts
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateRecommendedEnvironment } from '../../../packages/shared/environment.js';

describe('validateRecommendedEnvironment', () => {
    afterEach(() => {
        delete process.env.OLLAMA_BASE_URL;
        delete process.env.OLLAMA_MODEL;
    });

    it('warns when recommended variables are missing', () => {
        const warn = vi.fn();
        validateRecommendedEnvironment({ warn });
        expect(warn).toHaveBeenCalledWith('missing_recommended_env_vars', {
            missing: ['OLLAMA_BASE_URL', 'OLLAMA_MODEL']
        });
    });

    it('does not warn when recommended variables are present', () => {
        process.env.OLLAMA_BASE_URL = 'http://localhost:11434';
        process.env.OLLAMA_MODEL = 'llama3';
        const warn = vi.fn();
        validateRecommendedEnvironment({ warn });
        expect(warn).not.toHaveBeenCalled();
    });
});
