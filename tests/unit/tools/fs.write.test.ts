import fs from 'fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeFileTool } from '@/packages/tools/fs.write.js';
import { PathSafetyError } from '@/packages/shared/path-safety.js';

describe('writeFileTool workspace guards', () => {
    let temporaryWorkspaceRoot: string;
    let previousWorkspaceRoot: string | undefined;
    let previousWriteDenylist: string | undefined;

    beforeEach(async () => {
        previousWorkspaceRoot = process.env.AGENT_WORKSPACE_ROOT;
        previousWriteDenylist = process.env.AGENT_WRITE_DENYLIST;

        temporaryWorkspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'manna-fs-write-'));
        execFileSync('git', ['init'], { cwd: temporaryWorkspaceRoot, stdio: 'ignore' });
        process.env.AGENT_WORKSPACE_ROOT = temporaryWorkspaceRoot;
        process.env.AGENT_WRITE_DENYLIST = '.git,.env,.env.*';

        await fs.writeFile(
            path.join(temporaryWorkspaceRoot, '.gitignore'),
            'dist/\n*.log\n',
            'utf-8'
        );
    });

    afterEach(async () => {
        if (previousWorkspaceRoot === undefined) {
            delete process.env.AGENT_WORKSPACE_ROOT;
        } else {
            process.env.AGENT_WORKSPACE_ROOT = previousWorkspaceRoot;
        }
        if (previousWriteDenylist === undefined) {
            delete process.env.AGENT_WRITE_DENYLIST;
        } else {
            process.env.AGENT_WRITE_DENYLIST = previousWriteDenylist;
        }
        await fs.rm(temporaryWorkspaceRoot, { recursive: true, force: true });
    });

    it('allows writes inside non-ignored workspace paths', async () => {
        await writeFileTool.execute({
            path: 'src/allowed.ts',
            content: 'export const ok = true;\n'
        });

        const written = await fs.readFile(
            path.join(temporaryWorkspaceRoot, 'src/allowed.ts'),
            'utf-8'
        );
        expect(written).toBe('export const ok = true;\n');
    });

    it('blocks writes to paths ignored by .gitignore', async () => {
        await expect(
            writeFileTool.execute({ path: 'dist/generated.js', content: 'console.log("no");\n' })
        ).rejects.toThrow('path is ignored by .gitignore');
    });

    it('blocks writes to paths matched by AGENT_WRITE_DENYLIST', async () => {
        await expect(
            writeFileTool.execute({ path: '.env.local', content: 'SECRET=value\n' })
        ).rejects.toThrow('AGENT_WRITE_DENYLIST');
    });

    it('blocks path traversal attempts that escape the workspace root', async () => {
        await expect(
            writeFileTool.execute({ path: '../outside.txt', content: 'blocked\n' })
        ).rejects.toThrow(PathSafetyError);
    });
});
