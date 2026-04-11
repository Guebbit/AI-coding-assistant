import { randomUUID } from "node:crypto";
import { QdrantClient } from "@qdrant/js-client-rest";
import { getLogger } from "../../logger/src/logger";

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
const log = getLogger("memory");

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
  const startedAt = Date.now();
  addToRecentMemory(entry);

  if (!qdrantEnabled) {
    log.info("memory_added_local_only", {
      recentCount: recentMemory.length,
      durationMs: Date.now() - startedAt,
    });
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
    log.warn("memory_qdrant_disabled", {
      error: String(err),
      message: "Falling back to in-memory only",
    });
    return;
  }

  log.info("memory_added", {
    recentCount: recentMemory.length,
    vectorSize,
    durationMs: Date.now() - startedAt,
  });
}

/** Return recent + semantic memory for a task query (default cap: 10 entries). */
export async function getMemory(
  query = "",
  n = DEFAULT_RETURN_COUNT
): Promise<string[]> {
  const startedAt = Date.now();
  const cappedN = Math.max(1, n);
  const recent = recentMemory.slice(-cappedN);

  if (!qdrantEnabled || query.trim() === "") {
    log.info("memory_read_recent_only", {
      queryLength: query.length,
      returnedCount: recent.length,
      qdrantEnabled,
      durationMs: Date.now() - startedAt,
    });
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

    const merged: string[] = [...recent];
    const seen = new Set(merged);
    for (const item of semantic) {
      if (!seen.has(item)) {
        merged.push(item);
        seen.add(item);
      }
    }
    const output = merged.slice(0, cappedN);
    log.info("memory_read_hybrid", {
      queryLength: query.length,
      recentCount: recent.length,
      semanticCount: semantic.length,
      returnedCount: output.length,
      durationMs: Date.now() - startedAt,
    });
    return output;
  } catch (err) {
    log.warn("memory_qdrant_search_failed", {
      error: String(err),
      queryLength: query.length,
      returnedCount: recent.length,
      durationMs: Date.now() - startedAt,
    });
    return recent;
  }
}

/** Wipe local entries and clear Qdrant memory collection when available. */
export async function clearMemory(): Promise<void> {
  const startedAt = Date.now();
  recentMemory.length = 0;

  if (!qdrantEnabled) {
    log.info("memory_cleared_recent_only", { durationMs: Date.now() - startedAt });
    return;
  }

  try {
    await qdrant.deleteCollection(QDRANT_COLLECTION);
    vectorSize = null;
  } catch (err) {
    log.warn("memory_clear_failed", {
      error: String(err),
      durationMs: Date.now() - startedAt,
    });
    return;
  }

  log.info("memory_cleared", { durationMs: Date.now() - startedAt });
}
