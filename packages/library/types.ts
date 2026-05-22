/**
 * Library domain types — data shapes for the multi-library PDF
 * ingestion and semantic search system.
 *
 * These types are shared between the library package, persistence layer,
 * API endpoints, and any future CLI or agent-tool integrations.
 *
 * @module library/types
 */

/* ── Article ─────────────────────────────────────────────────────────── */

/** Minimal stub produced by Pass 1 (structure discovery). */
export interface IArticleStub {
    /** Article headline from the table of contents. */
    title: string;
    /** First printed page number. */
    startPage: number;
    /** Last printed page number (null for single-page articles). */
    endPage: number | null;
}

/** Full article entry stored after Pass 2 (content extraction + embedding). */
export interface IArticleEntry {
    /** Unique identifier (UUID). */
    id: string;
    /** Article headline as it appears in the table of contents. */
    title: string;
    /** 2–4 sentence LLM-generated summary. */
    summary: string;
    /** LLM-generated topic tags. */
    topics: string[];
    /** Publication year. */
    year: number;
    /** Publication month (full English name, e.g. "March"). */
    month: string;
    /** First printed page number. */
    startPage: number;
    /** Last printed page number (undefined if single-page). */
    endPage?: number;
    /** Absolute path to the PDF on disk. */
    pdfPath: string;
    /** Offset between printed page and PDF 0-based index. */
    pdfPageOffset?: number;
    /** Qdrant point ID for this article's embedding. */
    qdrantPointId: string;
}

/** Ranked search result — article entry with similarity score. */
export interface IRankedArticle extends IArticleEntry {
    /** Cosine similarity score (0–1). */
    score: number;
}

/** Export-friendly article shape (no embedding, no score). */
export type IArticleExport = Omit<IArticleEntry, 'qdrantPointId'>;

/* ── Library ─────────────────────────────────────────────────────────── */

/** Library metadata as stored in Postgres. */
export interface ILibraryInfo {
    /** Library identifier (slug, e.g. "scientific-american"). */
    id: string;
    /** Human-readable display name. */
    name: string;
    /** Number of articles currently indexed. */
    articleCount: number;
    /** ISO 8601 timestamp of the most recent import. */
    lastImport: string | null;
}

/** Configuration stored alongside the library (Postgres JSONB). */
export interface ILibraryConfig {
    /** Default TOC page range for structure discovery [start, end]. */
    tocPages?: [number, number];
    /** Root storage path for this library's PDFs. */
    storagePath?: string;
}

/* ── Import ──────────────────────────────────────────────────────────── */

/** A single PDF to import (from the API request body). */
export interface IPdfEntry {
    /** Absolute path to the PDF file on disk. */
    path: string;
    /** Publication year (inferred from path if omitted). */
    year?: number;
    /** Publication month (inferred from path if omitted). */
    month?: string;
}

/** Request body for POST /library/:libraryId/import. */
export interface IImportRequest {
    /** Specific PDF files to import (takes precedence over `folder`). */
    pdfs?: IPdfEntry[];
    /** Folder path for recursive batch import. */
    folder?: string;
}

/** Response from the import endpoint. */
export interface IImportResult {
    /** Number of articles successfully imported. */
    imported: number;
    /** Number of PDFs skipped due to errors. */
    skipped: number;
    /** Error messages for failed PDFs. */
    errors: string[];
}

/* ── Search ──────────────────────────────────────────────────────────── */

/** Request body for POST /library/:libraryId/search. */
export interface ISearchRequest {
    /** Natural-language search query. */
    query: string;
    /** Number of top results to return (default: 5). */
    topK?: number;
    /** Optional metadata filters. */
    filters?: {
        year?: number;
        month?: string;
    };
}
