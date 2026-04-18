/**
 * Unit tests for the envNumber helper (packages/shared/utils.ts).
 *
 * envNumber parses environment variable strings into numbers using
 * parseFloat, returning a fallback on failure.
 */

import { describe, it, expect } from 'vitest';
import { envNumber } from '@/packages/shared/utils.js';

describe('envNumber', () => {
    it('returns the parsed float for a decimal string', () => {
        expect(envNumber('3.14', 0)).toBe(3.14);
    });

    it('returns an integer value from a whole-number string', () => {
        expect(envNumber('42', 0)).toBe(42);
    });

    it('returns the fallback when value is undefined', () => {
        expect(envNumber(undefined, 99)).toBe(99);
    });

    it('returns the fallback when value is an empty string', () => {
        expect(envNumber('', 5)).toBe(5);
    });

    it('returns the fallback when value is non-numeric', () => {
        expect(envNumber('not-a-number', 7)).toBe(7);
    });

    it('returns the fallback when value is "NaN"', () => {
        expect(envNumber('NaN', 1.5)).toBe(1.5);
    });

    it('returns zero when value is "0"', () => {
        expect(envNumber('0', 99)).toBe(0);
    });

    it('handles negative numbers', () => {
        expect(envNumber('-1.5', 0)).toBe(-1.5);
    });

    it('parses float strings as-is (no truncation)', () => {
        expect(envNumber('3.9', 0)).toBe(3.9);
    });
});
