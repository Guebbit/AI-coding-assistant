/**
 * Semantic search over a library's article embeddings.
 *
 * Embeds the user query, performs ANN search in Qdrant, and returns
 * ranked article results with metadata from Postgres.
 *
 * @module library/search
 */

import { getEmbedding } from '../llm/embeddings';
import { logger } from '../logger/logger';
import { searchPoints } from './library-store';
import type { IRankedArticle, ISearchRequest } from './types';

/**
 * Build a Qdrant filter object from the search request filters.
 *
 * @param filters - Optional year/month filters.
 * @returns Qdrant filter or undefined if no filters are active.
 */
function buildQdrantFilter(
    filters?: ISearchRequest['filters']
): Record<string, unknown> | undefined {
    if (!filters) return undefined;

    const must: Record<string, unknown>[] = [];

    if (filters.year !== undefined) {
        must.push({ key: 'year', match: { value: filters.year } });
    }
    if (filters.month !== undefined) {
        must.push({ key: 'month', match: { value: filters.month } });
    }

    if (must.length === 0) return undefined;
    return { must };
}

/**
 * Perform semantic search over a library's article index.
 *
 * @param libraryId - The library to search.
 * @param request   - Search parameters (query, topK, filters).
 * @returns Ranked array of matching articles.
 */
export async function searchLibrary(
    libraryId: string,
    request: ISearchRequest
): Promise<IRankedArticle[]> {
    const { query, topK = 5, filters } = request;

    /* Embed the query. */
    const queryVector = await getEmbedding(query);

    /* Build optional filter. */
    const filter = buildQdrantFilter(filters);

    /* ANN search in Qdrant. */
    const hits = await searchPoints(libraryId, queryVector, topK, filter);

    logger.info('library_search_complete', {
        component: 'library.search',
        libraryId,
        query: query.slice(0, 100),
        results: hits.length
    });

    /* Map Qdrant results to ranked article shape. */
    return hits.map((hit) => ({
        id: String(hit.id),
        score: hit.score,
        title: (hit.payload.title as string) ?? '',
        summary: (hit.payload.summary as string) ?? '',
        topics: (hit.payload.topics as string[]) ?? [],
        year: (hit.payload.year as number) ?? 0,
        month: (hit.payload.month as string) ?? '',
        startPage: (hit.payload.startPage as number) ?? 0,
        endPage: (hit.payload.endPage as number) ?? undefined,
        pdfPath: (hit.payload.pdfPath as string) ?? '',
        pdfPageOffset: (hit.payload.pdfPageOffset as number) ?? 0,
        qdrantPointId: String(hit.id)
    }));
}
