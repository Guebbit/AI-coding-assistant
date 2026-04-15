/**
 * Shared math utilities.
 *
 * Provides reusable mathematical functions used across multiple
 * packages (semantic search, tool-reranker, etc.).
 *
 * @module shared/math
 */

/**
 * Compute the cosine similarity between two equal-length vectors.
 *
 * Returns −1 when vectors are empty, zero-norm, or have mismatched
 * dimensions (treated as completely dissimilar).
 *
 * @param a - First embedding vector.
 * @param b - Second embedding vector.
 * @returns Cosine similarity in the range [−1, 1].
 */
export function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) {
        return -1;
    }
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) {
        return -1;
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
