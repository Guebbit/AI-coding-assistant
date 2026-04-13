/**
 * HTML reader tool — extract plain text (and title) from HTML files.
 *
 * Uses a lightweight regex-based approach to strip HTML tags and
 * decode common HTML entities without adding a heavy parser dependency.
 *
 * @module tools/html.read
 */

import fs from 'fs/promises';
import { resolveSafePath } from '../shared';
import { createTool } from './tool-builder';
import { z } from 'zod';

/** Maximum HTML input size in bytes to process. Larger files are truncated. */
const MAX_HTML_INPUT_CHARS = 1_000_000;

/**
 * Decode a small set of common HTML entities.
 *
 * The `&amp;` case is handled last to avoid double-decoding patterns
 * such as `&amp;lt;` → `&lt;` → `<`.
 *
 * @param html - Raw HTML string that may contain entities.
 * @returns String with entities replaced by their Unicode equivalents.
 */
function decodeEntities(html: string): string {
    return (
        html
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&nbsp;/g, ' ')
            /* Replace &amp; last to prevent double-unescaping. */
            .replace(/&amp;/g, '&')
    );
}

/**
 * Strip all HTML tags and normalise whitespace.
 *
 * @param html - Raw HTML source string.
 * @returns Plain text with tags removed and whitespace collapsed.
 */
function htmlToText(html: string): string {
    return decodeEntities(
        html
            /* Remove <script>…</script> blocks including closing tags with spaces/attributes. */
            .replace(/<script[\s\S]*?<\/script[^>]*>/gi, ' ')
            .replace(/<style[\s\S]*?<\/style[^>]*>/gi, ' ')
            /* Insert newlines at block-level boundaries. */
            .replace(/<\/(p|div|li|h[1-6]|tr|br)[^>]*>/gi, '\n')
            /* Strip remaining tags. */
            .replace(/<[^>]+>/g, ' ')
            /* Collapse runs of whitespace. */
            .replace(/[ \t]+/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim()
    );
}

/**
 * Extract the content of the `<title>` element, if present.
 *
 * @param html - Raw HTML source string.
 * @returns The title text, or `undefined` when not found.
 */
function extractTitle(html: string): string | undefined {
    const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    return match ? decodeEntities(match[1]).trim() : undefined;
}

/**
 * Tool instance for extracting text from HTML files.
 *
 * Input:  `{ path: string }`.
 * Output: `{ text: string, title?: string }`.
 */
export const readHtmlTool = createTool({
    id: 'read_html',
    description:
        'Extract plain text (and title) from an HTML file. ' +
        'Input: { path: string }. ' +
        'Output: { text: string, title?: string }.',
    inputSchema: z.object({
        path: z.string().min(1, '"path" must be a non-empty string')
    }),

    /**
     * Read the HTML file and return its text content and optional title.
     *
     * @param input      - Tool input.
     * @param input.path - Path to the HTML file (relative to project root).
     * @returns `{ text, title? }`.
     */
    async execute({ path: htmlPath }) {
        const safePath = resolveSafePath(htmlPath);
        let raw = await fs.readFile(safePath, 'utf-8');
        /* Truncate very large inputs to avoid catastrophic backtracking. */
        if (raw.length > MAX_HTML_INPUT_CHARS) {
            raw = raw.slice(0, MAX_HTML_INPUT_CHARS);
        }
        const text = htmlToText(raw);
        const title = extractTitle(raw);
        return { text, ...(title !== undefined ? { title } : {}) };
    }
});
