/**
 * PDF reader tool — extract text content from PDF files.
 *
 * Accepts a PDF from disk (`path`) **or** as inline base64 data
 * (`data`).  Uses the `pdf-parse` library to parse the document and
 * the shared `resolveSafePath` helper to prevent directory traversal
 * when reading from disk.
 *
 * When both `path` and `data` are provided, `data` takes precedence.
 *
 * @module tools/pdf.read
 */

import fs from 'fs/promises';
import { PDFParse } from 'pdf-parse';
import type { ITool } from './types';
import { resolveSafePath } from '../shared';

/**
 * Tool instance for reading text from PDF files.
 *
 * Input (disk): `{ path: string }`
 * Input (inline base64): `{ data: string }`
 * Output: `{ path, pageCount, text }`
 */
export const readPdfTool: ITool = {
    name: 'read_pdf',
    description:
        'Read text from a PDF file. ' +
        'Input: { path?: string, data?: string (base64) }. ' +
        'Provide either path (file on disk) or data (base64-encoded PDF).',

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
        let buffer: Buffer;

        if (typeof data === 'string' && data.trim() !== '') {
            buffer = Buffer.from(data, 'base64');
        } else if (typeof pdfPath === 'string' && pdfPath.trim() !== '') {
            const safePath = resolveSafePath(pdfPath);
            buffer = await fs.readFile(safePath);
        } else {
            throw new Error(
                'Either "path" (file on disk) or "data" (base64 string) must be provided'
            );
        }

        const parser = new PDFParse({ data: buffer });
        const parsed = await parser.getText();
        await parser.destroy();

        return {
            path: typeof pdfPath === 'string' ? pdfPath : undefined,
            pageCount: parsed.total,
            text: parsed.text.trim()
        };
    }
};
