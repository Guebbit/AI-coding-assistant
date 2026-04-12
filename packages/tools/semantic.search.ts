import fs from "fs/promises";
import path from "path";
import type { Tool } from "./types";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? "nomic-embed-text";
const MAX_DOCUMENTS = 50;
const MAX_DOC_CHARS = 12_000;

interface RankedDoc {
  source: string;
  score: number;
  snippet: string;
}

function resolveSafePath(filePath: string): string {
  const resolved = path.resolve(process.cwd(), filePath);
  const root = path.resolve(process.cwd());
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error("Access denied: path is outside the project root");
  }
  return resolved;
}

async function getEmbedding(text: string): Promise<number[]> {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_EMBED_MODEL,
      prompt: text,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Embedding API error: ${res.status} ${res.statusText}${body ? ` — ${body}` : ""}`
    );
  }

  const data = (await res.json()) as {
    embedding?: number[];
    embeddings?: number[][];
  };

  const embedding = data.embedding ?? data.embeddings?.[0];
  if (!embedding || embedding.length === 0) {
    throw new Error("Embedding API returned an empty embedding vector");
  }
  return embedding;
}

function cosineSimilarity(a: number[], b: number[]): number {
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

export const semanticSearchTool: Tool = {
  name: "semantic_search",
  description:
    "Semantic search over provided text snippets and/or files. " +
    "Input: { query: string, documents?: string[], paths?: string[], topK?: number }",

  async execute({ query, documents, paths, topK }) {
    if (typeof query !== "string" || query.trim() === "") {
      throw new Error('"query" must be a non-empty string');
    }

    const docs: Array<{ source: string; text: string }> = [];

    if (Array.isArray(documents)) {
      for (const [idx, value] of documents.entries()) {
        if (typeof value !== "string" || value.trim() === "") {
          continue;
        }
        docs.push({
          source: `document:${idx + 1}`,
          text: value.slice(0, MAX_DOC_CHARS),
        });
      }
    }

    if (Array.isArray(paths)) {
      for (const filePath of paths) {
        if (typeof filePath !== "string" || filePath.trim() === "") {
          continue;
        }
        const safePath = resolveSafePath(filePath);
        const content = await fs.readFile(safePath, "utf-8");
        docs.push({
          source: `file:${filePath}`,
          text: content.slice(0, MAX_DOC_CHARS),
        });
      }
    }

    if (docs.length === 0) {
      throw new Error('Provide at least one item in "documents" or "paths"');
    }

    if (docs.length > MAX_DOCUMENTS) {
      throw new Error(`Too many documents. Maximum supported: ${MAX_DOCUMENTS}`);
    }

    const queryEmbedding = await getEmbedding(query);

    const ranked: RankedDoc[] = [];
    for (const doc of docs) {
      const embedding = await getEmbedding(doc.text);
      ranked.push({
        source: doc.source,
        score: cosineSimilarity(queryEmbedding, embedding),
        snippet: doc.text.slice(0, 500),
      });
    }

    const k = typeof topK === "number" && topK > 0 ? Math.min(Math.floor(topK), ranked.length) : Math.min(5, ranked.length);
    ranked.sort((a, b) => b.score - a.score);
    return {
      model: OLLAMA_EMBED_MODEL,
      query,
      totalDocuments: ranked.length,
      results: ranked.slice(0, k),
    };
  },
};
