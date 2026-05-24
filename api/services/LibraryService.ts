/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ArticleExport } from '../models/ArticleExport';
import type { ImportRequest } from '../models/ImportRequest';
import type { ImportResult } from '../models/ImportResult';
import type { LibraryInfo } from '../models/LibraryInfo';
import type { RankedArticle } from '../models/RankedArticle';
import type { SearchRequest } from '../models/SearchRequest';
import type { SuccessEnvelope } from '../models/SuccessEnvelope';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class LibraryService {
    /**
     * List all libraries
     * Returns all registered libraries with their configuration metadata and
     * ingestion status (article count, last import timestamp).
     *
     * @returns any List of libraries
     * @throws ApiError
     */
    public static listLibraries(): CancelablePromise<(SuccessEnvelope & {
        data?: Array<LibraryInfo>;
    })> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/library',
            errors: {
                500: `Internal server error (LLM failure, Qdrant unavailable, etc.)`,
            },
        });
    }
    /**
     * Import PDFs into a library using the two-pass ingestion pipeline
     * Ingests one or more PDF files (or an entire folder) into the specified library.
     * Runs the two-pass pipeline:
     *
     * 1. **Pass 1 — Structure discovery**: the LLM reads the table-of-contents pages
     * of each PDF to extract article titles and page ranges.
     * 2. **Pass 2 — Content extraction**: for each article, the LLM summarises the
     * text and generates topic tags; the summary is embedded and stored in Qdrant.
     *
     * Accepts **either** `pdfs` (array of specific files) **or** `folder` (directory path).
     * If both are provided, `pdfs` takes precedence.
     *
     * This is a long-running operation. For large archives (hundreds of PDFs), it may
     * take minutes to hours. The endpoint returns only after all PDFs are processed.
     * Failed PDFs are reported in the `errors` array without aborting the batch.
     *
     * See the Library Ingestion documentation for full architecture details.
     *
     * @param libraryId Unique identifier of the library (lowercase alphanumeric and hyphens).
     * Example: `scientific-american`, `nature-journal`, `my-ebook-library`.
     *
     * @param requestBody
     * @returns any Import completed
     * @throws ApiError
     */
    public static importLibrary(
        libraryId: string,
        requestBody: ImportRequest,
    ): CancelablePromise<(SuccessEnvelope & {
        data?: ImportResult;
    })> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/library/{libraryId}/import',
            path: {
                'libraryId': libraryId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Invalid request body or parameters`,
                404: `The requested resource was not found`,
                500: `Internal server error (LLM failure, Qdrant unavailable, etc.)`,
            },
        });
    }
    /**
     * Semantic article search within a specific library
     * Embeds the query using `OLLAMA_EMBED_MODEL` (default `nomic-embed-text`) and
     * performs ANN cosine similarity search over the library's article embedding index
     * in Qdrant.
     *
     * Returns a ranked list of articles with metadata, PDF path, and similarity score.
     * The caller can use the returned `pdfPath` and `startPage` to open the exact
     * article in the PDF viewer.
     *
     * Optional `filters` allow narrowing results by publication year and/or month.
     * Optional `topK` controls how many articles are returned (default: 5).
     *
     * See the Library Ingestion documentation for full architecture details.
     *
     * @param libraryId Unique identifier of the library (lowercase alphanumeric and hyphens).
     * Example: `scientific-american`, `nature-journal`, `my-ebook-library`.
     *
     * @param requestBody
     * @returns any Ranked list of matching articles
     * @throws ApiError
     */
    public static searchLibrary(
        libraryId: string,
        requestBody: SearchRequest,
    ): CancelablePromise<(SuccessEnvelope & {
        data?: Array<RankedArticle>;
    })> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/library/{libraryId}/search',
            path: {
                'libraryId': libraryId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Invalid request body or parameters`,
                404: `The requested resource was not found`,
                500: `Internal server error (LLM failure, Qdrant unavailable, etc.)`,
            },
        });
    }
    /**
     * Export all article metadata as JSON
     * Returns the full article metadata index for the library as a JSON array.
     * Intended for human review, manual editing, or backup.
     *
     * The exported JSON can be inspected to verify ingestion quality (summaries,
     * topic tags, page numbers) and re-imported after manual corrections.
     *
     * Embedding vectors are excluded from the export to keep the response
     * size manageable. Re-embedding is required if the index is rebuilt from scratch.
     *
     * @param libraryId Unique identifier of the library (lowercase alphanumeric and hyphens).
     * Example: `scientific-american`, `nature-journal`, `my-ebook-library`.
     *
     * @returns any Full article index (without embedding vectors)
     * @throws ApiError
     */
    public static exportLibrary(
        libraryId: string,
    ): CancelablePromise<(SuccessEnvelope & {
        data?: Array<ArticleExport>;
    })> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/library/{libraryId}/export',
            path: {
                'libraryId': libraryId,
            },
            errors: {
                404: `The requested resource was not found`,
                500: `Internal server error (LLM failure, Qdrant unavailable, etc.)`,
            },
        });
    }
}
