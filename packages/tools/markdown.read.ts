/**
 * Markdown reader tool — read a Markdown file from disk.
 *
 * Returns the raw Markdown text so the agent can reason about its
 * content, structure, or generate summaries.
 *
 * @module tools/markdown.read
 */

import fs from 'fs/promises';
import { resolveSafePath } from '../shared';
import { createTool } from './tool-builder';
import { z } from 'zod';

/**
 * Tool instance for reading Markdown files from the filesystem.
 *
 * Input:  `{ path: string }`.
 * Output: `{ text: string }` — the raw Markdown content.
 */
export const readMarkdownTool = createTool({
    id: 'read_markdown',
    description:
        'Read a Markdown (.md) file from disk. ' +
        'Input: { path: string }. ' +
        'Output: { text: string }.',
    inputSchema: z.object({
        path: z.string().min(1, '"path" must be a non-empty string')
    }),

    /**
     * Read the Markdown file and return its raw content.
     *
     * @param input      - Tool input.
     * @param input.path - Path to the Markdown file (relative to project root).
     * @returns `{ text }` — the file's content as a string.
     */
    async execute({ path: mdPath }) {
        const safePath = resolveSafePath(mdPath);
        const text = await fs.readFile(safePath, 'utf-8');
        return { text };
    }
});
