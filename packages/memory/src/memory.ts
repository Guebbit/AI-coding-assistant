import { randomUUID } from "node:crypto";
import { QdrantClient } from "@qdrant/js-client-rest";

/**
 * Hybrid short-term memory:
 * - local ring buffer for ultra-recent continuity
 * - Qdrant vector storage for semantic recall across tasks
 */
const MAX_ENTRIES = 20;
const DEFAULT_RETURN_COUNT = 10;
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? "nomic-embed-text";
const QDRANT_URL = process.env.QDRANT_URL ?? "http://localhost:6333";
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION ?? "agent_memory";

const recentMemory: string[] = [];
const qdrant = new QdrantClient({ url: QDRANT_URL });

let qdrantEnabled = true;
let vectorSize: number | null = null;
let ensureCollectionPromise: Promise<void> | null = null;

function addToRecentMemory(entry: string): void {
  recentMemory.push(entry);
  if (recentMemory.length > MAX_ENTRIES) {
    recentMemory.shift();
  }
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

async function ensureCollection(size: number): Promise<void> {
  if (ensureCollectionPromise) {
    return ensureCollectionPromise;
  }

  ensureCollectionPromise = (async () => {
    try {
      await qdrant.getCollection(QDRANT_COLLECTION);
    } catch {
      await qdrant.createCollection(QDRANT_COLLECTION, {
        vectors: { size, distance: "Cosine" },
      });
    }
  })();

  try {
    await ensureCollectionPromise;
  } finally {
    ensureCollectionPromise = null;
  }
}

/** Append a new entry to local memory and Qdrant (when available). */
export async function addMemory(entry: string): Promise<void> {
  addToRecentMemory(entry);

  if (!qdrantEnabled) {
    return;
  }

  try {
    const vector = await getEmbedding(entry);
    vectorSize = vector.length;
    await ensureCollection(vector.length);

    await qdrant.upsert(QDRANT_COLLECTION, {
      wait: true,
      points: [
        {
          id: randomUUID(),
          vector,
          payload: { text: entry, createdAt: new Date().toISOString() },
        },
      ],
    });
  } catch (err) {
    qdrantEnabled = false;
    console.warn(
      `Qdrant memory disabled for this process (falling back to in-memory only): ${String(err)}`
    );
  }
}

/** Return recent + semantic memory for a task query (default cap: 10 entries). */
export async function getMemory(
  query = "",
  n = DEFAULT_RETURN_COUNT
): Promise<string[]> {
  const cappedN = Math.max(1, n);
  const recent = recentMemory.slice(-cappedN);

  if (!qdrantEnabled || query.trim() === "") {
    return recent;
  }

  try {
    const queryVector = await getEmbedding(query);
    await ensureCollection(queryVector.length);

    const results = await qdrant.search(QDRANT_COLLECTION, {
      vector: queryVector,
      limit: cappedN,
      with_payload: true,
    });

    const semantic = results
      .map((point) => {
        const payload = point.payload as { text?: unknown } | null | undefined;
        return typeof payload?.text === "string" ? payload.text : null;
      })
      .filter((value): value is string => value !== null);

    const merged = [...recent, ...semantic];
    return Array.from(new Set(merged)).slice(-cappedN);
  } catch (err) {
    console.warn(`Qdrant memory search failed, using recent memory only: ${String(err)}`);
    return recent;
  }
}

/** Wipe local entries and clear Qdrant memory collection when available. */
export async function clearMemory(): Promise<void> {
  recentMemory.length = 0;

  if (!qdrantEnabled) {
    return;
  }

  try {
    await qdrant.deleteCollection(QDRANT_COLLECTION);
    if (vectorSize) {
      await ensureCollection(vectorSize);
    }
  } catch (err) {
    console.warn(`Failed to clear Qdrant memory collection: ${String(err)}`);
  }
}
