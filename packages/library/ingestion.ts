/**
 * Two-pass ingestion pipeline for library PDF import.
 *
 * Pass 1 — Structure Discovery: LLM reads TOC pages to extract article
 * titles and page ranges.
 * Pass 2 — Content Extraction: for each article stub, extract text,
 * summarise, generate tags, embed, and store in Qdrant + Postgres.
 *
 * @module library/ingestion
 */

import { randomUUID } from 'node:crypto';
import { generate } from '../llm/ollama';
import { getEmbedding } from '../llm/embeddings';
import { logger } from '../logger/logger';
import { createArticle, updateLibraryStats, countArticles, upsertLibrary } from '../persistence/db';
import { extractPageRange } from './pdf-extraction';
import { ensureCollection, upsertPoint } from './library-store';
import type { IArticleStub, IImportResult, IPdfEntry } from './types';

/* ── Configuration ──────────────────────────────────────────────────── */

/** Default page range for table-of-contents extraction. */
const DEFAULT_TOC_PAGES: [number, number] = [1, 4];

/** Maximum characters of article text sent to the LLM for summarisation. */
const MAX_ARTICLE_TEXT = 6000;

/* ── Pass 1: Structure Discovery ─────────────────────────────────────── */

/**
 * LLM reads the table-of-contents pages and extracts article stubs.
 *
 * @param pdfPath  - Path to the PDF file.
 * @param tocPages - Page range for the TOC [start, end] (1-based).
 * @returns Array of article stubs (title + page range).
 */
export async function discoverStructure(
    pdfPath: string,
    tocPages: [number, number] = DEFAULT_TOC_PAGES
): Promise<IArticleStub[]> {
    const tocText = await extractPageRange(pdfPath, tocPages[0], tocPages[1]);

    if (!tocText.trim()) {
        logger.warn('library_empty_toc', { component: 'library.ingestion', pdfPath });
        return [];
    }

    const prompt = `You are reading the table of contents of a magazine issue.
Extract every article entry. Return a JSON array:
[{ "title": "...", "startPage": N, "endPage": N or null }]

Only return valid JSON. No explanation text.

Table of contents text:
${tocText}`;

    const response = await generate(prompt, { format: 'json' });

    try {
        const parsed = JSON.parse(response) as IArticleStub[];
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(
            (stub) => typeof stub.title === 'string' && typeof stub.startPage === 'number'
        );
    } catch (error) {
        logger.warn('library_toc_parse_failed', {
            component: 'library.ingestion',
            pdfPath,
            error: String(error)
        });
        return [];
    }
}

/* ── Pass 2: Content Extraction ──────────────────────────────────────── */

/**
 * For a single article stub: extract text, summarise, generate tags, embed.
 *
 * @param pdfPath - Path to the PDF.
 * @param stub    - Article stub from Pass 1.
 * @param meta    - Publication metadata (year, month).
 * @returns Object with summary, topics, and embedding vector.
 */
async function extractArticleContent(
    pdfPath: string,
    stub: IArticleStub,
    meta: { year?: number; month?: string }
): Promise<{ summary: string; topics: string[]; embedding: number[] }> {
    const endPage = stub.endPage ?? stub.startPage + 5;
    const articleText = await extractPageRange(pdfPath, stub.startPage, endPage);
    const truncated = articleText.slice(0, MAX_ARTICLE_TEXT);

    const prompt = `Summarise this magazine article in 2–3 sentences.
Also list 3–5 topic tags (single words or short phrases).
Return JSON: { "summary": "...", "topics": ["..."] }

Only return valid JSON. No explanation text.

Article text:
${truncated}`;

    const response = await generate(prompt, { format: 'json' });

    let summary = `Article: ${stub.title}`;
    let topics: string[] = [];

    try {
        const parsed = JSON.parse(response) as { summary?: string; topics?: string[] };
        if (parsed.summary) summary = parsed.summary;
        if (Array.isArray(parsed.topics)) topics = parsed.topics;
    } catch {
        logger.warn('library_article_parse_failed', {
            component: 'library.ingestion',
            title: stub.title
        });
    }

    /* Embed the concatenation of title + summary for semantic search. */
    const textToEmbed = `${stub.title}. ${summary}`;
    const embedding = await getEmbedding(textToEmbed);

    return { summary, topics, embedding };
}

/* ── Orchestrator ────────────────────────────────────────────────────── */

/**
 * Infer year/month from a PDF file path.
 * Attempts patterns like `/2026/03.pdf` or `/2026/March.pdf`.
 */
function inferMetaFromPath(pdfPath: string): { year?: number; month?: string } {
    const yearMatch = pdfPath.match(/\/(\d{4})\//);
    const year = yearMatch ? Number.parseInt(yearMatch[1], 10) : undefined;

    /* Try to get month from filename (e.g. "03.pdf" or "March.pdf"). */
    const filenameMatch = pdfPath.match(/\/([^/]+)\.pdf$/i);
    let month: string | undefined;
    if (filenameMatch) {
        const name = filenameMatch[1];
        const monthNum = Number.parseInt(name, 10);
        if (monthNum >= 1 && monthNum <= 12) {
            const months = [
                'January',
                'February',
                'March',
                'April',
                'May',
                'June',
                'July',
                'August',
                'September',
                'October',
                'November',
                'December'
            ];
            month = months[monthNum - 1];
        } else if (/^[a-z]/i.test(name)) {
            month = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
        }
    }

    return { year, month };
}

/**
 * Import a single PDF into a library using the two-pass pipeline.
 *
 * @param libraryId - Target library identifier.
 * @param entry     - PDF entry with path and optional metadata.
 * @param tocPages  - TOC page range override.
 * @returns Number of articles successfully imported from this PDF.
 */
export async function importPdf(
    libraryId: string,
    entry: IPdfEntry,
    tocPages?: [number, number]
): Promise<number> {
    const inferred = inferMetaFromPath(entry.path);
    const year = entry.year ?? inferred.year;
    const month = entry.month ?? inferred.month;

    /* Pass 1: discover structure from table of contents. */
    const stubs = await discoverStructure(entry.path, tocPages);

    if (stubs.length === 0) {
        logger.warn('library_no_articles_found', {
            component: 'library.ingestion',
            pdfPath: entry.path
        });
        return 0;
    }

    let imported = 0;

    /* Pass 2: extract content, embed, and store each article. */
    for (const stub of stubs) {
        try {
            const { summary, topics, embedding } = await extractArticleContent(entry.path, stub, {
                year,
                month
            });

            const pointId = randomUUID();

            /* Store embedding in Qdrant. */
            await upsertPoint(libraryId, pointId, embedding, {
                title: stub.title,
                summary,
                topics,
                year: year ?? null,
                month: month ?? null,
                startPage: stub.startPage,
                endPage: stub.endPage ?? null,
                pdfPath: entry.path
            });

            /* Store metadata in Postgres. */
            await createArticle({
                libraryId,
                title: stub.title,
                summary,
                topics,
                year: year ?? null,
                month: month ?? null,
                startPage: stub.startPage,
                endPage: stub.endPage ?? null,
                pdfPath: entry.path,
                qdrantPointId: pointId
            });

            imported++;
        } catch (error) {
            logger.warn('library_article_import_failed', {
                component: 'library.ingestion',
                title: stub.title,
                error: String(error)
            });
        }
    }

    return imported;
}

/**
 * Run a full import batch for a library.
 *
 * Ensures the library exists in Postgres and its Qdrant collection is created,
 * then processes each PDF entry sequentially.
 *
 * @param libraryId - Target library identifier.
 * @param entries   - Array of PDF entries to import.
 * @param tocPages  - Optional TOC page range override.
 * @returns Import result summary.
 */
export async function runImport(
    libraryId: string,
    entries: IPdfEntry[],
    tocPages?: [number, number]
): Promise<IImportResult> {
    /* Ensure library exists in Postgres. */
    await upsertLibrary({
        id: libraryId,
        name: libraryId.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    });

    /* Ensure Qdrant collection exists. */
    await ensureCollection(libraryId);

    const result: IImportResult = { imported: 0, skipped: 0, errors: [] };

    for (const entry of entries) {
        try {
            const count = await importPdf(libraryId, entry, tocPages);
            result.imported += count;
            if (count === 0) result.skipped++;
        } catch (error) {
            result.errors.push(`${entry.path}: ${String(error)}`);
            result.skipped++;
        }
    }

    /* Update library stats. */
    const totalArticles = await countArticles(libraryId);
    await updateLibraryStats(libraryId, totalArticles);

    logger.info('library_import_complete', {
        component: 'library.ingestion',
        libraryId,
        imported: result.imported,
        skipped: result.skipped,
        errors: result.errors.length
    });

    return result;
}
