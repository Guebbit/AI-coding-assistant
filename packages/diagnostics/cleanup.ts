/**
 * Diagnostic log cleanup — prunes oldest files beyond a configurable limit.
 *
 * Keeps the `DIAGNOSTIC_LOG_DIR` folder tidy by deleting the oldest
 * Markdown reports when the file count exceeds `DIAGNOSTIC_LOG_MAX_FILES`.
 *
 * @module diagnostics/cleanup
 */

import fs from 'fs/promises';
import path from 'path';

/**
 * Delete the oldest files in `dir` so that at most `maxFiles` remain.
 *
 * Files are sorted by their `mtime` (last-modified timestamp) — the
 * oldest are deleted first.  Only regular files are considered; sub-
 * directories are left untouched.
 *
 * @param dir      - Absolute path to the directory to prune.
 * @param maxFiles - Maximum number of files to retain.
 * @returns The number of files deleted.
 */
export async function cleanupOldLogs(dir: string, maxFiles: number): Promise<number> {
    let entries: { name: string; mtime: number }[] = [];

    try {
        const dirents = await fs.readdir(dir, { withFileTypes: true });
        const stats = await Promise.all(
            dirents
                .filter((d) => d.isFile())
                .map(async (d) => {
                    const filePath = path.join(dir, d.name);
                    const stat = await fs.stat(filePath);
                    return { name: d.name, mtime: stat.mtimeMs };
                })
        );
        entries = stats;
    } catch {
        /* Directory does not exist yet — nothing to clean up. */
        return 0;
    }

    if (entries.length <= maxFiles) return 0;

    /* Sort ascending by mtime so the oldest are first. */
    entries.sort((a, b) => a.mtime - b.mtime);

    const toDelete = entries.slice(0, entries.length - maxFiles);
    await Promise.all(toDelete.map((f) => fs.unlink(path.join(dir, f.name))));

    return toDelete.length;
}
