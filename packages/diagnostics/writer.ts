/**
 * Diagnostic log writer — serialises `IDiagnosticEntry` arrays to a
 * timestamped Markdown file on disk.
 *
 * File output is controlled by three environment variables:
 * - `DIAGNOSTIC_LOG_ENABLED` (default `"true"`) — when `"false"`, the
 *   function is a no-op and returns an empty string.
 * - `DIAGNOSTIC_LOG_DIR` (default `"data/diagnostics"`) — output folder.
 *   Created automatically if it does not exist.
 * - `DIAGNOSTIC_LOG_MAX_FILES` (default `"100"`) — maximum number of files
 *   to retain; call `cleanupOldLogs` after writing to enforce the limit.
 *
 * @module diagnostics/writer
 */

import fs from 'fs/promises';
import path from 'path';
import { resolveInsideRoot } from '../shared';
import type { IDiagnosticEntry } from './types';

/** Toggle file output. Set `DIAGNOSTIC_LOG_ENABLED=false` to disable. */
const LOG_ENABLED = process.env.DIAGNOSTIC_LOG_ENABLED !== 'false';

/** Directory where diagnostic Markdown files are written. */
const LOG_DIR = process.env.DIAGNOSTIC_LOG_DIR ?? 'data/diagnostics';

/**
 * Slugify a task string into a safe filename component.
 *
 * Replaces non-alphanumeric characters with hyphens and truncates at 60
 * characters to keep filenames readable and filesystem-safe.
 *
 * @param task - The raw task string to slugify.
 * @returns A lowercase, hyphen-separated slug.
 */
function slugify(task: string): string {
    const raw = task
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 60);
    /* Trim leading/trailing hyphens without a regex to avoid ReDoS. */
    let start = 0;
    let end = raw.length;
    while (start < end && raw[start] === '-') start++;
    while (end > start && raw[end - 1] === '-') end--;
    return raw.slice(start, end);
}

/**
 * Render a severity badge as a Markdown-friendly emoji prefix.
 *
 * @param severity - The entry severity level.
 * @returns A short emoji string.
 */
function severityBadge(severity: IDiagnosticEntry['severity']): string {
    switch (severity) {
        case 'error':
            return '🔴';
        case 'warn':
            return '🟡';
        default:
            return '🟢';
    }
}

/**
 * Write a diagnostic Markdown report for a completed (or failed) agent run.
 *
 * Creates the output directory if it does not exist, then writes a file
 * named `{ISO-timestamp}_{taskSlug}.md`.  The path is resolved via
 * `resolveInsideRoot` so output can never escape `LOG_DIR`.
 *
 * When `DIAGNOSTIC_LOG_ENABLED` is `"false"` the function is a no-op and
 * returns an empty string without touching the filesystem.
 *
 * @param entries      - Array of diagnostic entries collected during the run.
 * @param taskSlug     - Short identifier for the task (used in the filename).
 * @param aiCommentary - Optional AI-generated summary to append as commentary.
 * @returns The absolute path of the written file, or `""` when disabled.
 */
export async function writeDiagnosticLog(
    entries: IDiagnosticEntry[],
    taskSlug: string,
    aiCommentary?: string
): Promise<string> {
    if (!LOG_ENABLED) return '';

    const absDir = path.resolve(process.cwd(), LOG_DIR);
    await fs.mkdir(absDir, { recursive: true });

    const iso = new Date().toISOString().replace(/[:.]/g, '-');
    const slug = slugify(taskSlug);
    /* Sanitise the filename: keep only alphanumeric, hyphens, and dots.
     * This removes any residual characters that could be used for path
     * injection even after slugify. */
    const safeFilename = `${iso}_${slug}.md`.replace(/[^a-zA-Z0-9_\-. ]/g, '_');

    /* resolveInsideRoot ensures the file stays inside absDir. */
    const filePath = resolveInsideRoot(absDir, safeFilename);

    const rows = entries
        .map(
            (e) =>
                `| ${e.step} | ${severityBadge(e.severity)} ${e.severity} | ${e.category} | ${e.message} |`
        )
        .join('\n');

    const table =
        entries.length > 0
            ? `| Step | Severity | Category | Message |\n|------|----------|----------|------|\n${rows}`
            : '_No entries recorded._';

    const commentary = aiCommentary?.trim() || 'No commentary available.';

    const content = [
        `# Diagnostic Report — ${new Date().toISOString()} — ${slug}`,
        '',
        '## Timeline',
        '',
        table,
        '',
        '## AI Commentary',
        '',
        commentary,
        ''
    ].join('\n');

    await fs.writeFile(filePath, content, 'utf-8');
    return filePath;
}
