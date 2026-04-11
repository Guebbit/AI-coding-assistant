# memory — Short-term Storage

## What

Stores recent context with a hybrid strategy:

- local in-process recent memory
- semantic vector memory in Qdrant

## Role

"Here is what happened recently" for the agent prompt.

## Behavior

- Local recent memory capacity: **20** entries max (oldest evicted first)
- Semantic recall comes from Qdrant similarity search
- Embeddings are generated with Ollama (`OLLAMA_EMBED_MODEL`)
- If Qdrant is unavailable, memory gracefully falls back to local recent memory

## API

- `addMemory(entry)`
- `getMemory(query, n = 10)`
- `clearMemory()`

## Used by

- `agent` while building prompts and saving completed outcomes

## Where in code

- `packages/memory/src/memory.ts`
