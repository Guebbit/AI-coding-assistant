/**
 * Document ingestion tool — detect, parse, chunk, embed, and store a
 * document in Qdrant for later semantic retrieval.
 *
 * Supported formats: `.txt`, `.md`, `.json`, `.html`, `.csv`, `.docx`.
 * Each chunk is embedded via Ollama and upserted into the configured
 * Qdrant collection with file metadata.
 *
 * This is a **write** tool — only register it when `allowWrite: true`.
 *
 * Environment variables (all optional):
 * - `OLLAMA_BASE_URL` (default `http://localhost:11434`)
 * - `OLLAMA_EMBED_MODEL` (default `nomic-embed-text`)
 * - `QDRANT_URL` (default `http://localhost:6333`)
 * - `QDRANT_COLLECTION` (default `agent_memory`)
 *
 * @module tools/document.ingest
 */

import path from 'path';
import { randomUUID } from 'node:crypto';
import { QdrantClient } from '@qdrant/js-client-rest';
import { resolveSafePath, chunkText } from '../shared';
import { createTool } from './tool-builder';
import { z } from 'zod';
import { readFileTool } from './fs.read';
import { readDocxTool } from './docx.read';
import { readCsvTool } from './csv.read';
import { readHtmlTool } from './html.read';
import { readJsonTool } from './json.read';
import { readMarkdownTool } from './markdown.read';

/* ── Configuration ──────────────────────────────────────────────────── */

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text';
const QDRANT_URL = process.env.QDRANT_URL ?? 'http://localhost:6333';
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION ?? 'agent_memory';

const qdrant = new QdrantClient({ url: QDRANT_URL });

/* ── Helpers ─────────────────────────────────────────────────────────── */

/**
 * Request an embedding vector from Ollama for the given text.
 *
 * @param text - The text to embed.
 * @returns A numeric embedding vector.
 * @throws {Error} When the API call fails or returns an empty vector.
 */
async function embedText(text: string): Promise<number[]> {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: OLLAMA_EMBED_MODEL, prompt: text })
    });
    if (!res.ok) {
        throw new Error(`Ollama embedding API error: ${res.status} ${res.statusText}`);
    }
    const json = (await res.json()) as { embedding?: number[] };
    if (!json.embedding?.length) {
        throw new Error('Ollama returned an empty embedding vector');
    }
    return json.embedding;
}

/**
 * Extract plain text from a file by dispatching to the appropriate reader.
 *
 * @param filePath - Absolute safe path to the file.
 * @param ext      - Lowercase file extension (e.g. `".docx"`).
 * @returns Extracted plain text.
 * @throws {Error} When the file format is not supported.
 */
async function extractText(filePath: string, ext: string): Promise<string> {
    /* Use relative path for tools that call resolveSafePath internally. */
    const rel = path.relative(process.cwd(), filePath);

    switch (ext) {
        case '.docx': {
            const r = (await readDocxTool.execute({ path: rel })) as { text: string };
            return r.text;
        }
        case '.csv': {
            const r = (await readCsvTool.execute({ path: rel })) as { text: string };
            return r.text;
        }
        case '.html':
        case '.htm': {
            const r = (await readHtmlTool.execute({ path: rel })) as { text: string };
            return r.text;
        }
        case '.json': {
            const r = (await readJsonTool.execute({ path: rel })) as { data: unknown };
            return JSON.stringify(r.data, null, 2);
        }
        case '.md':
        case '.markdown': {
            const r = (await readMarkdownTool.execute({ path: rel })) as { text: string };
            return r.text;
        }
        default: {
            /* Fallback: treat as plain text. */
            const r = await readFileTool.execute({ path: rel });
            return typeof r === 'string' ? r : JSON.stringify(r);
        }
    }
}

/* ── Tool ─────────────────────────────────────────────────────────────── */

/**
 * Tool instance for ingesting a document into the Qdrant vector store.
 *
 * Input:  `{ path: string, collection?: string }`.
 * Output: `{ chunksIngested: number, collection: string }`.
 */
export const documentIngestTool = createTool({
    id: 'document_ingest',
    description:
        'Ingest a document (txt, md, json, html, csv, docx) into the vector store for semantic search. ' +
        'Input: { path: string, collection?: string }. ' +
        'Output: { chunksIngested: number, collection: string }. ' +
        'This tool writes data — only available when allowWrite is true.',
    inputSchema: z.object({
        path: z.string().min(1, '"path" must be a non-empty string'),
        collection: z.string().optional()
    }),

    /**
     * Detect the file type, extract text, chunk it, embed each chunk, and
     * upsert all vectors into Qdrant.
     *
     * @param input            - Tool input.
     * @param input.path       - Path to the document (relative to project root).
     * @param input.collection - Target Qdrant collection (defaults to `QDRANT_COLLECTION`).
     * @returns `{ chunksIngested, collection }`.
     */
    async execute({ path: docPath, collection }) {
        const targetCollection = collection ?? QDRANT_COLLECTION;
        const safePath = resolveSafePath(docPath);
        const ext = path.extname(safePath).toLowerCase();
        const filename = path.basename(safePath);

        const text = await extractText(safePath, ext);
        const chunks = chunkText(text, { chunkSize: 500, overlap: 50 });

        /* Ensure collection exists — create with a placeholder vector size
       if not yet present.  We use the actual embedding size once we have
       the first vector. */
        let vectorSize = 768; /* nomic-embed-text default */

        /* Embed all chunks and upsert in one batch. */
        const points: { id: string; vector: number[]; payload: Record<string, unknown> }[] = [];
        for (const chunk of chunks) {
            const vector = await embedText(chunk.content);
            if (chunk.index === 0) vectorSize = vector.length;
            points.push({
                id: randomUUID(),
                vector,
                payload: {
                    text: chunk.content,
                    chunkIndex: chunk.index,
                    filename,
                    sourcePath: docPath
                }
            });
        }

        /* Create the collection if it does not exist. */
        try {
            await qdrant.createCollection(targetCollection, {
                vectors: { size: vectorSize, distance: 'Cosine' }
            });
        } catch {
            /* Collection already exists — ignore. */
        }

        if (points.length > 0) {
            await qdrant.upsert(targetCollection, {
                wait: true,
                points: points.map((p) => ({
                    id: p.id,
                    vector: p.vector,
                    payload: p.payload
                }))
            });
        }

        return { chunksIngested: points.length, collection: targetCollection };
    }
});
