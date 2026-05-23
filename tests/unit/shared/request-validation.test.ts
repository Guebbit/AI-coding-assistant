/**
 * Unit tests for packages/shared/request-validation.ts
 */

import { describe, expect, it } from 'vitest';
import { validateToolPolicy } from '@/packages/shared/request-validation.js';

describe('validateToolPolicy', () => {
    it('accepts a valid policy and normalizes duplicated entries', () => {
        const result = validateToolPolicy({
            mode: 'hybrid',
            allowlist: ['read_file', 'read_file', ' shell '],
            denylist: ['write_file'],
            preferred: ['read_json', 'read_json']
        });

        expect(result.error).toBeUndefined();
        expect(result.toolPolicy).toEqual({
            mode: 'hybrid',
            allowlist: ['read_file', 'shell'],
            denylist: ['write_file'],
            preferred: ['read_json']
        });
    });

    it('rejects invalid mode values', () => {
        const result = validateToolPolicy({ mode: 'hard-force' });
        expect(result.error).toContain('toolPolicy.mode');
    });

    it('rejects non-string entries in list fields', () => {
        const result = validateToolPolicy({ allowlist: ['read_file', 42] });
        expect(result.error).toContain('toolPolicy.allowlist');
    });
});
