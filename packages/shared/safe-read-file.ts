/**
 * Shared safe file-reading helper.
 *
 * Combines path traversal protection (`resolveSafePath`) with file reads
 * so reader-style tools can reuse a single implementation.
 *
 * @module shared/safe-read-file
 */

import fs from 'fs/promises';
import { resolveSafePath } from './path-safety';

/**
 * Safely read a file inside the workspace root.
 *
 * @param filePath - User-supplied path (relative or absolute).
 * @returns The raw file buffer when no encoding is provided.
 */
export async function safeReadFile(filePath: string): Promise<Buffer>;

/**
 * Safely read a text file inside the workspace root using a specific encoding.
 *
 * @param filePath - User-supplied path (relative or absolute).
 * @param encoding - Node.js buffer encoding.
 * @returns The decoded file text.
 */
export async function safeReadFile(filePath: string, encoding: BufferEncoding): Promise<string>;

/**
 * Safely read a file inside the workspace root.
 *
 * @param filePath - User-supplied path (relative or absolute).
 * @param encoding - Optional text encoding.
 * @returns File contents as `Buffer` (binary mode) or `string` (text mode).
 */
export async function safeReadFile(
    filePath: string,
    encoding?: BufferEncoding
): Promise<Buffer | string> {
    const safePath = resolveSafePath(filePath);
    if (encoding) {
        return fs.readFile(safePath, encoding);
    }
    return fs.readFile(safePath);
}
