/**
 * CSV reader tool — parse delimiter-separated files into structured data.
 *
 * Uses a simple split-based approach that handles quoted fields and
 * common delimiters (`,`, `;`, `\t`).  The first row is treated as the
 * header row.
 *
 * @module tools/csv.read
 */

import fs from 'fs/promises';
import { resolveSafePath } from '../shared';
import { createTool } from './tool-builder';
import { z } from 'zod';

/**
 * Parse a single CSV/TSV line respecting double-quoted fields.
 *
 * @param line      - A single line from the CSV file.
 * @param delimiter - The field separator character.
 * @returns An array of field values (unquoted and unescaped).
 */
function parseLine(line: string, delimiter: string): string[] {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                /* Escaped double-quote inside a quoted field. */
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (ch === delimiter && !inQuotes) {
            fields.push(current);
            current = '';
        } else {
            current += ch;
        }
    }
    fields.push(current);
    return fields;
}

/**
 * Tool instance for reading and parsing CSV / TSV files.
 *
 * Input:  `{ path: string, delimiter?: string }`.
 * Output: `{ text: string, headers: string[], rowCount: number }`.
 */
export const readCsvTool = createTool({
    id: 'read_csv',
    description:
        'Parse a CSV or delimited text file. ' +
        'Input: { path: string, delimiter?: string (default ",")}. ' +
        'Output: { text: string, headers: string[], rowCount: number }.',
    inputSchema: z.object({
        path: z.string().min(1, '"path" must be a non-empty string'),
        delimiter: z.string().max(1).optional()
    }),

    /**
     * Read the CSV file and return headers, row count, and a text preview.
     *
     * @param input           - Tool input.
     * @param input.path      - Path to the CSV file (relative to project root).
     * @param input.delimiter - Field separator (default: `","`).
     * @returns `{ text, headers, rowCount }`.
     */
    async execute({ path: csvPath, delimiter = ',' }) {
        const safePath = resolveSafePath(csvPath);
        const raw = await fs.readFile(safePath, 'utf-8');

        const lines = raw.split(/\r?\n/).filter((l) => l.trim() !== '');
        if (lines.length === 0) {
            return { text: '', headers: [], rowCount: 0 };
        }

        const headers = parseLine(lines[0], delimiter);
        const rowCount = lines.length - 1;

        /* Build a simple text representation (header + first 10 rows max). */
        const preview = lines
            .slice(0, 11)
            .map((l) => parseLine(l, delimiter).join(' | '))
            .join('\n');

        return { text: preview, headers, rowCount };
    }
});
