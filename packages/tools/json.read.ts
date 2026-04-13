/**
 * JSON reader tool — read and parse a JSON file from disk.
 *
 * Returns the parsed value as-is so the agent can reason about its
 * structure without needing a schema.
 *
 * @module tools/json.read
 */

import fs from 'fs/promises';
import { resolveSafePath } from '../shared';
import { createTool } from './tool-builder';
import { z } from 'zod';

/**
 * Tool instance for reading JSON files from the filesystem.
 *
 * Input:  `{ path: string }`.
 * Output: `{ data: unknown }` — the parsed JSON value.
 */
export const readJsonTool = createTool({
    id: 'read_json',
    description:
        'Read and parse a JSON file from disk. ' +
        'Input: { path: string }. ' +
        'Output: { data: unknown }.',
    inputSchema: z.object({
        path: z.string().min(1, '"path" must be a non-empty string')
    }),

    /**
     * Read the JSON file and return its parsed content.
     *
     * @param input      - Tool input.
     * @param input.path - Path to the JSON file (relative to project root).
     * @returns `{ data }` with the parsed JSON value.
     * @throws {Error} When the file content is not valid JSON.
     */
    async execute({ path: jsonPath }) {
        const safePath = resolveSafePath(jsonPath);
        const raw = await fs.readFile(safePath, 'utf-8');
        const data: unknown = JSON.parse(raw);
        return { data };
    }
});
