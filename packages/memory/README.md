# @ai-assistant/memory

Hybrid short-term memory store for agent context.

## API

- `addMemory(entry)` — append entry to recent memory + Qdrant
- `getMemory(query, n = 10)` — get merged recent + semantic memory
- `clearMemory()` — reset recent memory and clear Qdrant collection

## Behavior

- Local ring buffer is capped at 20 entries (oldest evicted first)
- Qdrant stores semantic vectors for cross-task recall
- Embeddings are generated through Ollama (`OLLAMA_EMBED_MODEL`)
- Falls back to local-only memory if Qdrant/embedding calls fail

## Key file

- `src/memory.ts`
