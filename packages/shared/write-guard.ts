/**
 * Write guard — protects the filesystem from unsafe agent writes.
 *
 * ROLE: Before any tool writes a file it calls `assertWritePathAllowed`.
 * This module checks two independent deny-lists:
 *   1. `.gitignore` — files Git ignores are considered sensitive.
 *   2. `AGENT_WRITE_DENYLIST` — operator-configured glob/path deny-list
 *      (defaults to `.git,.env,.env.*`).
 *
 * Centralising these checks in one module keeps the individual write tools
 * (fs.write, project.scaffold) free of security logic (SRP).
 *
 * @module shared/write-guard
 */

import fs from 'fs/promises';
import { execFile } from 'node:child_process';
import path from 'path';
import { promisify } from 'util';
import { getWorkspaceRoot } from './path-safety';

/** Promisified `execFile` for running Git commands without shell injection risk. */
const execFileAsync = promisify(execFile);

/**
 * Normalise a filesystem path to use forward-slashes.
 * Needed for cross-platform glob matching and Git comparisons.
 */
function normalizeRelativePath(targetPath: string): string {
    return targetPath.split(path.sep).join('/');
}

/**
 * Parse the `AGENT_WRITE_DENYLIST` env var into an array of patterns.
 * Defaults to `.git,.env,.env.*` when the variable is absent.
 */
function parseWriteDenylist(): string[] {
    const configured = process.env.AGENT_WRITE_DENYLIST;
    const raw = !configured || configured === 'undefined' ? '.git,.env,.env.*' : configured;
    return raw
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
}

/**
 * Convert a simple glob pattern (supports `*` and `**`) to a `RegExp`.
 * Special regex characters are escaped before wildcard substitution.
 */
function globToRegExp(pattern: string): RegExp {
    const escaped = pattern.replaceAll(/[$()+.[\\\]^{|}]/g, '\\$&');
    const withDoubleStar = escaped.replaceAll('**', '__DOUBLE_STAR__');
    const withSingleStar = withDoubleStar.replaceAll('*', '[^/]*');
    const normalized = withSingleStar.replaceAll('__DOUBLE_STAR__', '.*');
    return new RegExp(`^${normalized}$`);
}

/**
 * Test whether a relative path matches any entry in the write deny-list.
 * Exact-path and glob-pattern entries are both supported.
 */
function isMatchedByWriteDenylist(relativePath: string): { matched: boolean; pattern?: string } {
    const normalizedPath = normalizeRelativePath(relativePath);
    for (const pattern of parseWriteDenylist()) {
        const normalizedPattern = pattern.replace(/^\.?\//, '');
        const hasGlob = normalizedPattern.includes('*');
        if (!hasGlob) {
            if (
                normalizedPath === normalizedPattern ||
                normalizedPath.startsWith(`${normalizedPattern}/`)
            ) {
                return { matched: true, pattern };
            }
            continue;
        }
        if (globToRegExp(normalizedPattern).test(normalizedPath)) {
            return { matched: true, pattern };
        }
    }
    return { matched: false };
}

/**
 * Test whether a relative path is ignored by the workspace `.gitignore`.
 * Uses `git check-ignore` — returns `{ matched: false }` when Git is
 * unavailable or no `.gitignore` exists.
 */
async function isMatchedByGitIgnore(
    workspaceRoot: string,
    relativePath: string
): Promise<{ matched: boolean; patternSource?: string }> {
    const gitIgnorePath = path.join(workspaceRoot, '.gitignore');
    const hasGitIgnore = await fs
        .access(gitIgnorePath)
        .then(() => true)
        .catch(() => false);
    if (!hasGitIgnore) {
        return { matched: false };
    }

    try {
        const { stdout } = await execFileAsync(
            'git',
            ['-C', workspaceRoot, 'check-ignore', '--no-index', '--', relativePath],
            { encoding: 'utf-8', maxBuffer: 1024 * 1024 }
        );
        return { matched: stdout.trim().length > 0, patternSource: '.gitignore' };
    } catch (error) {
        const exitCode = (error as { code?: number | string }).code;
        if (exitCode === 1 || exitCode === '1') {
            return { matched: false };
        }
        return { matched: false };
    }
}

/**
 * Assert that the agent is allowed to write to the given resolved path.
 *
 * Checks two independent deny-lists in order:
 *  1. `.gitignore` — Git-ignored paths are considered sensitive.
 *  2. `AGENT_WRITE_DENYLIST` — operator-configured patterns.
 *
 * @param resolvedPath - Absolute, workspace-safe path returned by `resolveSafePath`.
 * @throws {Error} When the path is blocked by either deny-list.
 */
export async function assertWritePathAllowed(resolvedPath: string): Promise<void> {
    const workspaceRoot = getWorkspaceRoot();
    const relativePath = normalizeRelativePath(path.relative(workspaceRoot, resolvedPath));

    const gitIgnoreMatch = await isMatchedByGitIgnore(workspaceRoot, relativePath);
    if (gitIgnoreMatch.matched) {
        throw new Error(
            `Write blocked for "${relativePath}": path is ignored by ${gitIgnoreMatch.patternSource}`
        );
    }

    const denylistMatch = isMatchedByWriteDenylist(relativePath);
    if (denylistMatch.matched) {
        throw new Error(
            `Write blocked for "${relativePath}": path matches AGENT_WRITE_DENYLIST entry "${denylistMatch.pattern}"`
        );
    }
}
