/**
 * Unit tests for packages/shared/safe-read-file.ts
 */

import { afterAll, describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { safeReadFile } from '@/packages/shared/safe-read-file.js';

const temporaryDirectory = path.join(process.cwd(), 'data', 'tmp-safe-read-file-tests');

afterAll(async () => {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
});

describe('safeReadFile', () => {
    it('reads UTF-8 text with path safety', async () => {
        const filePath = path.join(temporaryDirectory, 'sample.txt');
        await fs.mkdir(temporaryDirectory, { recursive: true });
        await fs.writeFile(filePath, 'hello world', 'utf-8');

        const content = await safeReadFile(filePath, 'utf-8');
        expect(content).toBe('hello world');
    });

    it('reads binary data when encoding is omitted', async () => {
        const filePath = path.join(temporaryDirectory, 'sample.bin');
        const source = Buffer.from([1, 2, 3, 4, 5]);
        await fs.writeFile(filePath, source);

        const content = await safeReadFile(filePath);
        expect(Buffer.isBuffer(content)).toBe(true);
        expect((content as Buffer).equals(source)).toBe(true);
    });

    it('rejects path traversal outside workspace root', async () => {
        await expect(safeReadFile('../../etc/passwd', 'utf-8')).rejects.toThrow(
            'Access denied: path is outside the workspace root'
        );
    });
});
