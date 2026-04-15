/**
 * Read-file tool — reads a file from disk and returns its UTF-8 content.
 *
 * The path is resolved relative to the current working directory.
 * Directory traversal outside the project root is blocked by the
 * shared `safeReadFile` helper.
 *
 * @module tools/fs.read
 */

import { z } from 'zod';
import { safeReadFile } from '../shared';
import { createTool } from './tool-builder';

/**
 * Tool instance for reading files from the local filesystem.
 *
 * Input: `{ path: string }` — relative or absolute path to the file.
 * Output: The file's UTF-8 text content as a string.
 */
export const readFileTool = createTool({
    id: 'read_file',
    description: 'Read a file from disk. Input: { path: string }',
    inputSchema: z.object({
        path: z.string().trim().min(1, '"path" must be a non-empty string')
    }),
    outputSchema: z.string(),

    /**
     * Read the file at the given path and return its content.
     *
     * @param input      - Tool input object.
     * @param input.path - Path to the file (relative to project root).
     * @returns The UTF-8 contents of the file.
     * @throws {Error} When `path` is missing, empty, or escapes the project root.
     */
    execute({ path: filePath }) {
        return safeReadFile(filePath, 'utf-8');
    }
});
