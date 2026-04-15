# Packages

This repository is split into small, focused packages:

- `agent` — core agentic loop (reason → pick tool → execute → continue) + model router
- `events` — synchronous typed event bus used for observability
- `llm` — Ollama API wrapper, embeddings, and centralised configuration
- `memory` — hybrid short-term ring buffer + Qdrant semantic recall
- `tools` — tool interface and concrete tool implementations (20+ built-in tools)
- `orchestrator` — LangGraph-based swarm orchestrator for multi-agent task decomposition
- `swarm` — task decomposer and swarm types (used by orchestrator)
- `processors` — agent middleware (verification gate, tool reranker)
- `graph` — Neo4j knowledge graph client, NER extractor
- `diagnostics` — per-run Markdown diagnostic log writer
- `persistence` — PostgreSQL-backed agent/swarm run history
- `evals` — eval harness and scorer implementations
- `shared` — shared utilities (paths, env, response helpers, SSE, i18n, math, etc.)
- `logger` — Winston-based structured logger

The API server in `apps/api` wires these packages together.
