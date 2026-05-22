/**
 * PDF page-range extraction helper.
 *
 * Wraps the `pdf-parse` library to extract text from a specific page
 * range within a PDF. Used by the ingestion pipeline to read only the
 * table-of-contents pages (Pass 1) or a single article's pages (Pass 2).
 *
 * @module library/pdf-extraction
 */

import { PDFParse } from 'pdf-parse';
import { resolveSafePath } from '../shared';

/**
 * Extract text from a specific page range of a PDF file.
 *
 * Pages are 1-based (matching printed page numbers). The extraction
 * concatenates all text from `startPage` through `endPage` inclusive.
 *
 * @param pdfPath   - Path to the PDF file (validated via resolveSafePath).
 * @param startPage - First page to extract (1-based).
 * @param endPage   - Last page to extract (1-based, inclusive).
 * @returns Extracted text content from the specified page range.
 */
export async function extractPageRange(
    pdfPath: string,
    startPage: number,
    endPage: number
): Promise<string> {
    const safePath = resolveSafePath(pdfPath);
    const fs = await import('fs/promises');
    const buffer = await fs.readFile(safePath);

    const parser = new PDFParse({ data: buffer });
    const parsed = await parser.getText();
    await parser.destroy();

    /* pdf-parse returns all text as a single string. We split by form-feed
       characters (page breaks) or fall back to returning all text if the PDF
       doesn't contain explicit page separators. */
    const fullText = parsed.text;
    const pages = fullText.split('\f');

    /* If the PDF doesn't have form-feed separators, return all text. */
    if (pages.length <= 1) {
        return fullText.trim();
    }

    /* Extract the requested range (0-indexed internally). */
    const start = Math.max(0, startPage - 1);
    const end = Math.min(pages.length, endPage);
    return pages.slice(start, end).join('\n').trim();
}

/**
 * Extract all text from a PDF file.
 *
 * @param pdfPath - Path to the PDF file.
 * @returns Full extracted text and page count.
 */
export async function extractFullText(
    pdfPath: string
): Promise<{ text: string; pageCount: number }> {
    const safePath = resolveSafePath(pdfPath);
    const fs = await import('fs/promises');
    const buffer = await fs.readFile(safePath);

    const parser = new PDFParse({ data: buffer });
    const parsed = await parser.getText();
    await parser.destroy();

    return { text: parsed.text.trim(), pageCount: parsed.total };
}
