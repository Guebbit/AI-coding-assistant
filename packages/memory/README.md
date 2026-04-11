# @ai-assistant/memory

Simple short-term memory store for agent context.

## API

- `addMemory(entry)` — append an entry
- `getMemory(n = 10)` — get most recent entries
- `clearMemory()` — reset memory

## Behavior

- In-memory only (non-persistent)
- Capacity capped at 20 entries (oldest evicted first)

## Upgrading this package to Qdrant (vector memory)

Use this when you want semantic retrieval instead of only "last N" entries.

### Step 1 — Add dependencies

- Install `@qdrant/js-client-rest` in the root project.
- Add or choose an embedding provider (local or API).

Comment: Qdrant needs both a client and vectors.

### Step 2 — Add environment configuration

- `QDRANT_URL` (example: `http://localhost:6333`)
- `QDRANT_COLLECTION` (example: `agent_memory`)

Comment: keep infrastructure configuration outside code.

### Step 3 — Initialize collection once

On startup, ensure the Qdrant collection exists with the exact embedding vector size and distance metric.

Comment: mismatched vector size causes write/search failures.

### Step 4 — Update `addMemory(entry)`

- Embed `entry` text.
- Upsert a point to Qdrant with vector + payload (`text`, timestamp, optional tags).

Comment: payload keeps the original text and metadata for later reconstruction.

### Step 5 — Update `getMemory(n)`

- Build a query string from the current task/context.
- Embed that query.
- Search Qdrant with `limit: n`.
- Return ordered payload texts (or structured records).

Comment: retrieval becomes relevance-based, not just recency-based.

### Step 6 — Update `clearMemory()`

- Delete points in the configured collection (or recreate it).

Comment: keep the external API the same so callers do not change.

### Step 7 — Hybrid recall (recommended)

Keep a small local ring buffer for ultra-recent entries and merge it with semantic Qdrant results.

Comment: this improves both immediate continuity and long-term recall.

## Key file

- `src/memory.ts`
