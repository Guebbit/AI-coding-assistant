/**
 * Unit tests for packages/shared/path-safety.ts
 *
 * Tests the resolveSafePath and resolveInsideRoot functions that
 * prevent directory traversal attacks, and the PathSafetyError class
 * that carries typed error codes for the agent harness.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';
import {
    resolveSafePath,
    resolveInsideRoot,
    PathSafetyError,
    getWorkspaceRoot
} from '@/packages/shared/path-safety.js';

describe('PathSafetyError', () => {
    it('has code E_PATH_OUTSIDE_ROOT', () => {
        const error = new PathSafetyError('msg', '/attempt', '/root');
        expect(error.code).toBe('E_PATH_OUTSIDE_ROOT');
        expect(error.attemptedPath).toBe('/attempt');
        expect(error.root).toBe('/root');
        expect(error.name).toBe('PathSafetyError');
        expect(error instanceof PathSafetyError).toBe(true);
        expect(error instanceof Error).toBe(true);
    });
});

describe('resolveSafePath', () => {
    it('resolves a simple relative path within the project root', () => {
        const cwd = process.cwd();
        const result = resolveSafePath('packages/shared/utilities.ts');
        expect(result).toBe(path.resolve(cwd, 'packages/shared/utilities.ts'));
    });

    it('resolves an absolute path inside the project root', () => {
        const cwd = process.cwd();
        const inside = path.join(cwd, 'packages', 'file.ts');
        expect(resolveSafePath(inside)).toBe(inside);
    });

    it('throws PathSafetyError when a path traverses outside the project root', () => {
        expect(() => resolveSafePath('../../etc/passwd')).toThrow(PathSafetyError);
        expect(() => resolveSafePath('../../etc/passwd')).toThrow(
            'Access denied: path is outside the workspace root'
        );
    });

    it('throws PathSafetyError for an absolute path outside the project root', () => {
        expect(() => resolveSafePath('/etc/passwd')).toThrow(PathSafetyError);
    });

    describe('getWorkspaceRoot', () => {
        it('uses AGENT_WORKSPACE_ROOT when configured', () => {
            const previousWorkspaceRoot = process.env.AGENT_WORKSPACE_ROOT;
            process.env.AGENT_WORKSPACE_ROOT = 'packages';
            expect(getWorkspaceRoot()).toBe(path.resolve(process.cwd(), 'packages'));
            if (previousWorkspaceRoot === undefined) {
                delete process.env.AGENT_WORKSPACE_ROOT;
            } else {
                process.env.AGENT_WORKSPACE_ROOT = previousWorkspaceRoot;
            }
        });
    });

    it('resolves the project root itself without throwing', () => {
        const cwd = process.cwd();
        expect(resolveSafePath('.')).toBe(cwd);
    });

    it('exposes attemptedPath and root on the thrown PathSafetyError', () => {
        try {
            resolveSafePath('/etc/passwd');
        } catch (error) {
            expect(error instanceof PathSafetyError).toBe(true);
            expect((error as PathSafetyError).attemptedPath).toBe('/etc/passwd');
            expect((error as PathSafetyError).root).toBe(process.cwd());
        }
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

    it('throws PathSafetyError when a path traverses outside the root', () => {
        expect(() => resolveInsideRoot(temporaryRoot, '../outside.txt')).toThrow(PathSafetyError);
        expect(() => resolveInsideRoot(temporaryRoot, '../outside.txt')).toThrow(
            'Access denied: path is outside the allowed root'
        );
    });

    it('throws PathSafetyError for deeply nested traversal', () => {
        expect(() => resolveInsideRoot(temporaryRoot, 'a/b/../../../../outside.txt')).toThrow(
            PathSafetyError
        );
    });

    it('throws PathSafetyError when an absolute path escapes the root', () => {
        expect(() => resolveInsideRoot(temporaryRoot, '/etc/hosts')).toThrow(PathSafetyError);
    });
});
