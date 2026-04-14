# AI Coding Assistant Documentation

::: tip TL;DR
Local-first AI agent API — send a task, get an answer. Ollama models, tool execution, semantic memory.
:::

This documentation is now organized into **5 clear tracks**:

1. **Getting Started & Use Cases** → [/use-the-application](/use-the-application) — setup, plus how to use Manna as an IDE agent, for agentic programming, or as a knowledge base
2. **API Surface** → [/endpoint-map](/endpoint-map)
3. **Architecture** → [/theory/how-it-works-layered](/theory/how-it-works-layered)
4. **Modeling & Routing** → [/model-selection](/model-selection)
5. **Package Reference** → [/packages/](/packages/)

**New — Library & RAG:**

- [Library Ingestion & Search](/library-ingestion) — multi-PDF ingestion, semantic search, two-pass pipeline
- [RAG Theory](/theory/RAG) — what RAG is, architectures, when to use
- [Vector Databases](/theory/VECTOR_DATABASES) — Qdrant, HNSW, practical scaling

---

## What this project is

- Local-first TypeScript agent API (`POST /run`)
- Agentic loop with tool execution and memory
- Ollama backend with per-step model routing profiles

### System overview

```mermaid
flowchart LR
    User -->|POST /run| API
    API --> Agent
    Agent --> LLM[LLM / Ollama]
    Agent --> Tools[Tools]
    Agent --> Memory
    LLM -->|JSON decision| Agent
    Tools -->|result| Agent
    Memory -->|past context| Agent
    Agent -->|final answer| API
    API -->|response| User
```

## If you only read one flow

1. Start here: [/use-the-application](/use-the-application)
2. Explore the API surface: [/endpoint-map](/endpoint-map)
3. Understand internals: [/theory/how-it-works-layered](/theory/how-it-works-layered)
4. Configure models and routing: [/model-selection](/model-selection)
5. Dive into package/tool contracts: [/packages/](/packages/)

## Fast links

- Endpoint Map: [/endpoint-map](/endpoint-map)
- Library Ingestion & Search: [/library-ingestion](/library-ingestion)
- RAG Theory: [/theory/RAG](/theory/RAG)
- Vector Databases: [/theory/VECTOR_DATABASES](/theory/VECTOR_DATABASES)
- Scenarios: [/scenarios](/scenarios)
- Agent package: [/packages/agent](/packages/agent)
- LLM package: [/packages/llm](/packages/llm)
- Tools catalog: [/packages/tools/](/packages/tools/)
