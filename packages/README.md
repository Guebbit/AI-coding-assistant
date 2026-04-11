# Packages

This repository is split into small, focused packages:

- `agent` — core agentic loop (reason → pick tool → execute → continue)
- `events` — synchronous event bus used for observability
- `llm` — Ollama API wrapper
- `memory` — short-term in-memory memory buffer
- `tools` — tool interface and concrete tool implementations

The API server in `apps/api` wires these packages together.
