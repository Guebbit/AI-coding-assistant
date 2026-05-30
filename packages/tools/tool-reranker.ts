/**
 * Tool reranker — cosine-similarity reranking of the available tool list.
 *
 * ROLE: When the agent has many tools registered, sending all of them to
 * the LLM inflates the prompt and confuses routing. The reranker embeds
 * both the current task prompt and each tool's name+description, then
 * selects the top-N most semantically relevant tools.
 *
 * CACHE: Tool embeddings are cached by tool-set signature (sorted names)
 * to avoid re-embedding on every step when the tool list doesn't change.
 *
 * @module tools/tool-reranker
 */

import { getEmbedding } from '../llm/embeddings';
import { cosineSimilarity } from '../shared';

/**
 * Interface for the embedding backend used by the reranker.
 * Abstracted for testability — the production backend calls Ollama.
 */
export interface IToolRerankerBackend {
    /** Compute an embedding vector for the given text. */
    getEmbedding(text: string): Promise<number[]>;
}

/**
 * Production embedding backend that delegates to the Ollama embeddings API.
 */
export class OllamaToolRerankerBackend implements IToolRerankerBackend {
    /** @inheritdoc */
    getEmbedding(text: string): Promise<number[]> {
        return getEmbedding(text);
    }
}

/** Minimal tool descriptor the reranker needs — name + description. */
export interface IToolRerankerToolDefinition {
    /** Tool identifier (must match `ITool.name`). */
    name: string;
    /** Plain-English description forwarded to the embedding model. */
    description: string;
}

/**
 * Reranks a list of tools by cosine similarity to a given prompt.
 *
 * Usage:
 * ```typescript
 * const reranker = new ToolReranker(new OllamaToolRerankerBackend());
 * const topTools = await reranker.rerank(task, allTools, 5);
 * ```
 */
export class ToolReranker {
    /**
     * Embedding cache keyed by tool name.
     * Invalidated whenever the tool-set changes (detected via signature).
     */
    private readonly embeddingCache = new Map<string, number[]>();
    /** Signature of the last embedded tool set — used to detect changes. */
    private cachedToolSetSignature: string | null = null;

    /**
     * @param backend - Embedding backend (inject `OllamaToolRerankerBackend` in production).
     */
    constructor(private readonly backend: IToolRerankerBackend) {}

    /**
     * Build a stable string signature for a set of tools (sorted names joined by NUL).
     * Used to detect when the tool list changes and the cache must be invalidated.
     */
    private static buildToolSignature(tools: IToolRerankerToolDefinition[]): string {
        return tools
            .map((tool) => tool.name)
            .sort()
            .join('\u0000');
    }

    /**
     * Ensure the embedding cache is up-to-date for the given tool set.
     * Re-embeds all tools only when the set has changed since the last call.
     */
    private async ensureCache(tools: IToolRerankerToolDefinition[]): Promise<void> {
        const signature = ToolReranker.buildToolSignature(tools);
        if (signature === this.cachedToolSetSignature) return;

        this.embeddingCache.clear();
        await Promise.all(
            tools.map(async (tool) => {
                const definitionText = `${tool.name}\n${tool.description}`;
                const vector = await this.backend.getEmbedding(definitionText);
                this.embeddingCache.set(tool.name, vector);
            })
        );
        this.cachedToolSetSignature = signature;
    }

    /**
     * Return the top-N tools most relevant to the given prompt.
     *
     * Scores each tool via cosine similarity between the prompt embedding
     * and the tool-description embedding.  Returns `tools` unchanged when
     * `tools.length <= topN` (no embedding needed).
     *
     * @param prompt - The current task or step prompt to match against.
     * @param tools  - Full list of available tools to rank.
     * @param topN   - Maximum number of tools to return.
     */
    async rerank(
        prompt: string,
        tools: IToolRerankerToolDefinition[],
        topN: number
    ): Promise<IToolRerankerToolDefinition[]> {
        if (tools.length <= topN) return tools;
        await this.ensureCache(tools);
        const promptVector = await this.backend.getEmbedding(prompt);
        return tools
            .map((tool) => ({
                tool,
                score: cosineSimilarity(promptVector, this.embeddingCache.get(tool.name)!)
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, topN)
            .map((entry) => entry.tool);
    }
}
