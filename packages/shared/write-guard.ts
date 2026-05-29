import fs from 'fs/promises';
import { execFile } from 'node:child_process';
import path from 'path';
import { promisify } from 'util';
import { getWorkspaceRoot } from './path-safety';

const execFileAsync = promisify(execFile);

function normalizeRelativePath(targetPath: string): string {
    return targetPath.split(path.sep).join('/');
}

function parseWriteDenylist(): string[] {
    const configured = process.env.AGENT_WRITE_DENYLIST;
    const raw = !configured || configured === 'undefined' ? '.git,.env,.env.*' : configured;
    return raw
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
}

function globToRegExp(pattern: string): RegExp {
    const escaped = pattern.replaceAll(/[$()+.[\\\]^{|}]/g, '\\$&');
    const withDoubleStar = escaped.replaceAll('**', '__DOUBLE_STAR__');
    const withSingleStar = withDoubleStar.replaceAll('*', '[^/]*');
    const normalized = withSingleStar.replaceAll('__DOUBLE_STAR__', '.*');
    return new RegExp(`^${normalized}$`);
}

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
