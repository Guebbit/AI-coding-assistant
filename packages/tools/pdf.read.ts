/**
 * PDF reader tool — extract text content from PDF files.
 *
 * Accepts a PDF from disk (`path`) **or** as inline base64 data
 * (`data`).  Uses the `pdf-parse` library to parse the document and
 * the shared `safeReadFile` helper to prevent directory traversal
 * when reading from disk.
 *
 * When both `path` and `data` are provided, `data` takes precedence.
 *
 * @module tools/pdf.read
 */

import { PDFParse } from 'pdf-parse';
import { z } from 'zod';
import { resolveDataSource } from '../shared';
import { createTool } from './tool-builder';

/**
 * Tool instance for reading text from PDF files.
 *
 * Input (disk): `{ path: string }`
 * Input (inline base64): `{ data: string }`
 * Output: `{ path, pageCount, text }`
 */
export const readPdfTool = createTool({
    id: 'read_pdf',
    description:
        'Read text from a PDF file. ' +
        'Input: { path?: string, data?: string (base64) }. ' +
        'Provide either path (file on disk) or data (base64-encoded PDF).',
    inputSchema: z
        .object({
            path: z.string().trim().min(1).optional(),
            data: z.string().trim().min(1).optional()
        })
        .refine((input) => Boolean(input.path || input.data), {
            message: 'Either "path" (file on disk) or "data" (base64 string) must be provided'
        }),
    outputSchema: z.object({
        path: z.string().optional(),
        pageCount: z.number().int().nonnegative(),
        text: z.string()
    }),

    /**
     * Read and parse the PDF from disk or inline base64, returning its text content.
     *
     * @param input      - Tool input object.
     * @param input.path - Path to the PDF file (relative to project root). Required unless `data` is provided.
     * @param input.data - Base64-encoded PDF content. Takes precedence over `path`.
     * @returns `{ path, pageCount, text }` with the extracted text.
     * @throws {Error} When neither `path` nor `data` is provided.
     */
    async execute({ path: pdfPath, data }) {
        const buffer = await resolveDataSource(pdfPath, data);

        const parser = new PDFParse({ data: buffer });
        const parsed = await parser.getText();
        await parser.destroy();

        return {
            path: typeof pdfPath === 'string' ? pdfPath : undefined,
            pageCount: parsed.total,
            text: parsed.text.trim()
        };
    }
});
