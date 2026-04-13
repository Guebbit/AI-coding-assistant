/**
 * Text chunker — splits long text into overlapping chunks suitable for
 * embedding and vector-database ingestion.
 *
 * @module shared/chunker
 */

/**
 * A single chunk produced by `chunkText`.
 */
export interface IChunk {
    /** The chunk's text content. */
    content: string;

    /** Zero-based position of this chunk in the sequence. */
    index: number;
}

/**
 * Options controlling how `chunkText` splits text.
 */
export interface IChunkOptions {
    /**
     * Maximum number of characters per chunk.
     * @default 500
     */
    chunkSize?: number;

    /**
     * Number of characters to overlap between consecutive chunks.
     * Overlap ensures that context spanning a chunk boundary is captured
     * in both adjacent chunks, reducing information loss at split points.
     * @default 50
     */
    overlap?: number;
}

/**
 * Split `text` into a sequence of overlapping chunks.
 *
 * The function advances through the text in steps of
 * `(chunkSize - overlap)` characters, so consecutive chunks share
 * the last `overlap` characters of the previous chunk.
 *
 * @param text    - The source text to split.
 * @param options - Optional `{ chunkSize, overlap }` configuration.
 * @returns An ordered array of `IChunk` objects.
 *
 * @example
 * ```typescript
 * const chunks = chunkText("Hello world …", { chunkSize: 10, overlap: 2 });
 * // chunks[0].content === "Hello worl"
 * // chunks[1].content === "rld …"
 * ```
 */
export function chunkText(text: string, options?: IChunkOptions): IChunk[] {
    const chunkSize = Math.max(1, options?.chunkSize ?? 500);
    const overlap = Math.min(options?.overlap ?? 50, chunkSize - 1);
    const step = chunkSize - overlap;

    const chunks: IChunk[] = [];
    let offset = 0;
    let index = 0;

    while (offset < text.length) {
        const content = text.slice(offset, offset + chunkSize);
        chunks.push({ content, index });
        offset += step;
        index++;
    }

    return chunks;
}
