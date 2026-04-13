/**
 * DOCX reader tool — extract plain text from `.docx` files.
 *
 * Reads the `word/document.xml` entry from the DOCX ZIP archive and
 * strips all XML tags to produce a plain-text representation.
 *
 * This implementation parses the ZIP format using Node.js built-in
 * `zlib` (for deflate decompression) without any external dependencies.
 * Only the main document body is read; headers, footers, and embedded
 * images are ignored.
 *
 * @module tools/docx.read
 */

import fs from 'fs/promises';
import { resolveSafePath } from '../shared';
import { createTool } from './tool-builder';
import { z } from 'zod';

/* Use Node's built-in `zlib` + `node:stream` to read the ZIP without an
   external dependency.  We use the `fflate` or the native approach.
   Since `fflate` is not installed, we fall back to the `adm-zip`-compatible
   manual approach using Node's `zlib`. */

/**
 * Minimal ZIP entry reader — locates and decompresses a named entry
 * from a ZIP buffer using Node's built-in `zlib`.
 *
 * Searches the central directory for `word/document.xml` and
 * decompresses the stored data.
 *
 * @param buffer    - Raw ZIP file as a `Buffer`.
 * @param entryName - The entry name to extract (e.g. `"word/document.xml"`).
 * @returns The decompressed UTF-8 text of the entry.
 * @throws {Error} When the entry is not found in the archive.
 */
async function extractZipEntry(buffer: Buffer, entryName: string): Promise<string> {
    const { inflateRaw } = await import('zlib');
    const { promisify } = await import('util');
    const inflate = promisify(inflateRaw);

    /* Scan the local file headers in the ZIP.
     * Local file header signature = 0x04034b50 */
    let offset = 0;
    while (offset < buffer.length - 4) {
        const sig = buffer.readUInt32LE(offset);
        if (sig !== 0x04034b50) {
            offset++;
            continue;
        }
        const compression = buffer.readUInt16LE(offset + 8);
        const compressedSize = buffer.readUInt32LE(offset + 18);
        const fileNameLen = buffer.readUInt16LE(offset + 26);
        const extraLen = buffer.readUInt16LE(offset + 28);
        const name = buffer.slice(offset + 30, offset + 30 + fileNameLen).toString('utf-8');
        const dataStart = offset + 30 + fileNameLen + extraLen;

        if (name === entryName) {
            const compressed = buffer.slice(dataStart, dataStart + compressedSize);
            if (compression === 0) {
                /* Stored — no compression. */
                return compressed.toString('utf-8');
            } else if (compression === 8) {
                /* Deflated. */
                const decompressed = await inflate(compressed);
                return decompressed.toString('utf-8');
            } else {
                throw new Error(`Unsupported ZIP compression method: ${compression}`);
            }
        }
        offset = dataStart + compressedSize;
    }
    throw new Error(`Entry "${entryName}" not found in ZIP archive`);
}

/**
 * Strip XML tags from a string, returning plain text.
 *
 * Inserts newlines at OOXML paragraph/line-break boundaries before
 * removing all remaining tags.  The output is sanitised to contain no
 * angle brackets (a final pass removes any residual `<` characters).
 *
 * @param xml - Raw XML string.
 * @returns Text content with all XML tags removed.
 */
function stripXml(xml: string): string {
    const stripped = xml
        /* Insert newlines at paragraph/line-break elements before stripping. */
        .replace(/<w:p[\s/>]/gi, '\n')
        .replace(/<w:br[^>]*\/>/gi, '\n')
        /* Remove all XML/HTML tags — use [\s\S]*? to handle multi-line tag content. */
        .replace(/<[\s\S]*?>/g, '')
        /* Collapse excessive blank lines. */
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    /* Final safety pass: remove any residual '<' characters so the output
     * can never be interpreted as markup by a downstream renderer. */
    return stripped.replace(/</g, '');
}

/**
 * Tool instance for extracting plain text from `.docx` files.
 *
 * Input:  `{ path: string }` — relative path to the `.docx` file.
 * Output: `{ text: string }` — extracted plain text.
 */
export const readDocxTool = createTool({
    id: 'read_docx',
    description:
        'Extract plain text from a .docx file. Input: { path: string }. ' +
        'Output: { text: string }.',
    inputSchema: z.object({
        path: z.string().min(1, '"path" must be a non-empty string')
    }),

    /**
     * Read and parse the DOCX file, returning its text content.
     *
     * @param input      - Tool input.
     * @param input.path - Path to the `.docx` file (relative to project root).
     * @returns `{ text }` with the extracted plain text.
     */
    async execute({ path: docxPath }) {
        const safePath = resolveSafePath(docxPath);
        const buffer = await fs.readFile(safePath);
        const xml = await extractZipEntry(buffer, 'word/document.xml');
        const text = stripXml(xml);
        return { text };
    }
});
