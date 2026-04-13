/**
 * Write-file tool — writes UTF-8 content to a file under the
 * configured project output root.
 *
 * Supports three write modes:
 * - `"create"` (default) — fail if the file already exists.
 * - `"overwrite"` — replace existing file contents.
 * - `"append"` — append to the end of the file.
 *
 * All paths are sandboxed to `PROJECT_OUTPUT_ROOT` to prevent
 * accidental writes outside the designated output directory.
 *
 * @module tools/fs.write
 */

import fs from 'fs/promises';
import path from 'path';
import type { ITool } from './types';
import { resolveInsideRoot } from '../shared';

/** Absolute path to the designated output directory for generated files. */
const PROJECT_OUTPUT_ROOT = path.resolve(
    process.cwd(),
    process.env.PROJECT_OUTPUT_ROOT ?? 'data/generated-projects'
);

/** Allowed write modes. */
type WriteMode = 'create' | 'overwrite' | 'append';

/**
 * Tool instance for writing files under the generated-projects root.
 *
 * Input:
 * ```json
 * {
 *   "path":    "relative/path/to/file.txt",
 *   "content": "file content as UTF-8 string",
 *   "mode":    "create" | "overwrite" | "append"
 * }
 * ```
 */
export const writeFileTool: ITool = {
    name: 'write_file',
    description:
        'Write UTF-8 file content under the generated-projects root only. ' +
        'Input: { path: string, content: string, mode?: "create" | "overwrite" | "append" }',

    /**
     * Write the given content to a file under `PROJECT_OUTPUT_ROOT`.
     *
     * @param input         - Tool input object.
     * @param input.path    - Relative path under the output root.
     * @param input.content - String content to write.
     * @param input.mode    - Write mode: `"create"`, `"overwrite"`, or `"append"`.
     * @returns Metadata about the write operation (path, mode, bytes written).
     * @throws {Error} When inputs are invalid, path escapes the root, or file exists in create mode.
     */
    async execute({ path: filePath, content, mode }) {
        if (typeof filePath !== 'string' || filePath.trim() === '') {
            throw new Error('"path" must be a non-empty string');
        }
        if (typeof content !== 'string') {
            throw new Error('"content" must be a string');
        }

        const writeMode: WriteMode =
            mode === 'overwrite' || mode === 'append' || mode === 'create' ? mode : 'create';

        const resolvedPath = resolveInsideRoot(PROJECT_OUTPUT_ROOT, filePath);
        const parentDir = path.dirname(resolvedPath);
        await fs.mkdir(parentDir, { recursive: true });

        if (writeMode === 'append') {
            await fs.appendFile(resolvedPath, content, 'utf-8');
        } else if (writeMode === 'overwrite') {
            await fs.writeFile(resolvedPath, content, 'utf-8');
        } else {
            /* "create" mode — fail if file already exists. */
            try {
                await fs.writeFile(resolvedPath, content, { encoding: 'utf-8', flag: 'wx' });
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
                    throw new Error(
                        `File already exists at "${filePath}". Use mode "overwrite" to replace it.`
                    );
                }
                throw error;
            }
        }

        return {
            path: path.relative(process.cwd(), resolvedPath),
            mode: writeMode,
            bytesWritten: Buffer.byteLength(content, 'utf-8'),
            outputRoot: path.relative(process.cwd(), PROJECT_OUTPUT_ROOT)
        };
    }
};
