/**
 * Read-file tool — reads a file from disk and returns its UTF-8 content.
 *
 * The path is resolved relative to the current working directory.
 * Directory traversal outside the project root is blocked by the
 * shared `resolveSafePath` helper.
 *
 * @module tools/fs.read
 */

import fs from 'fs/promises';
import type { ITool } from './types';
import { resolveSafePath } from '../shared';

/**
 * Tool instance for reading files from the local filesystem.
 *
 * Input: `{ path: string }` — relative or absolute path to the file.
 * Output: The file's UTF-8 text content as a string.
 */
export const readFileTool: ITool = {
    name: 'read_file',
    description: 'Read a file from disk. Input: { path: string }',

    /**
     * Read the file at the given path and return its content.
     *
     * @param input      - Tool input object.
     * @param input.path - Path to the file (relative to project root).
     * @returns The UTF-8 contents of the file.
     * @throws {Error} When `path` is missing, empty, or escapes the project root.
     */
    async execute({ path: filePath }) {
        if (typeof filePath !== 'string' || filePath.trim() === '') {
            throw new Error('"path" must be a non-empty string');
        }

        const resolved = resolveSafePath(filePath);
        return await fs.readFile(resolved, 'utf-8');
    }
};
