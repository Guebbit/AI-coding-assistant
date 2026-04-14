/**
 * Unit tests for packages/shared/path-safety.ts
 *
 * Tests the resolveSafePath and resolveInsideRoot functions that
 * prevent directory traversal attacks.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { resolveSafePath, resolveInsideRoot } from '../../../packages/shared/path-safety.js';

describe('resolveSafePath', () => {
    it('resolves a simple relative path within the project root', () => {
        const cwd = process.cwd();
        const result = resolveSafePath('packages/shared/env.ts');
        expect(result).toBe(path.resolve(cwd, 'packages/shared/env.ts'));
    });

    it('resolves an absolute path inside the project root', () => {
        const cwd = process.cwd();
        const inside = path.join(cwd, 'packages', 'file.ts');
        expect(resolveSafePath(inside)).toBe(inside);
    });

    it('throws when a path traverses outside the project root', () => {
        expect(() => resolveSafePath('../../etc/passwd')).toThrow(
            'Access denied: path is outside the project root'
        );
    });

    it('throws for an absolute path outside the project root', () => {
        expect(() => resolveSafePath('/etc/passwd')).toThrow(
            'Access denied: path is outside the project root'
        );
    });

    it('resolves the project root itself without throwing', () => {
        const cwd = process.cwd();
        expect(resolveSafePath('.')).toBe(cwd);
    });
});

describe('resolveInsideRoot', () => {
    let temporaryRoot: string;

    beforeAll(() => {
        temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'manna-test-'));
    });

    afterAll(() => {
        fs.rmSync(temporaryRoot, { recursive: true, force: true });
    });

    it('resolves a relative path inside the provided root', () => {
        const result = resolveInsideRoot(temporaryRoot, 'subdir/file.txt');
        expect(result).toBe(path.resolve(temporaryRoot, 'subdir/file.txt'));
    });

    it('resolves the root directory itself without throwing', () => {
        expect(resolveInsideRoot(temporaryRoot, '.')).toBe(temporaryRoot);
    });

    it('throws when a path traverses outside the root', () => {
        expect(() => resolveInsideRoot(temporaryRoot, '../outside.txt')).toThrow(
            'Access denied: path is outside the allowed root'
        );
    });

    it('throws for deeply nested traversal', () => {
        expect(() => resolveInsideRoot(temporaryRoot, 'a/b/../../../../outside.txt')).toThrow(
            'Access denied: path is outside the allowed root'
        );
    });

    it('throws when an absolute path escapes the root', () => {
        expect(() => resolveInsideRoot(temporaryRoot, '/etc/hosts')).toThrow(
            'Access denied: path is outside the allowed root'
        );
    });
});
