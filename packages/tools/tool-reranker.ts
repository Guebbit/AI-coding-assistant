import { getEmbedding } from '../llm/embeddings';
import { cosineSimilarity } from '../shared';

export interface IToolRerankerBackend {
    getEmbedding(text: string): Promise<number[]>;
}

export class OllamaToolRerankerBackend implements IToolRerankerBackend {
    getEmbedding(text: string): Promise<number[]> {
        return getEmbedding(text);
    }
}

export interface IToolRerankerToolDefinition {
    name: string;
    description: string;
}

export class ToolReranker {
    private readonly embeddingCache = new Map<string, number[]>();
    private cachedToolSetSignature: string | null = null;

    constructor(private readonly backend: IToolRerankerBackend) {}

    private static buildToolSignature(tools: IToolRerankerToolDefinition[]): string {
        return tools
            .map((tool) => tool.name)
            .sort()
            .join('\u0000');
    }

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
