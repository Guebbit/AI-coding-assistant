# Packages Overview

The API app wires small focused packages:

- `agent` — the decision loop
- `model-router` — per-step model profile selection inside the agent
- `llm` — Ollama HTTP wrapper
- `memory` — short-term context storage
- `events` — in-process pub/sub notifications
- `tools` — actions the agent can execute

## Fast mental map

1. API gets a task
2. `agent` asks `llm` what to do
3. `agent` may call one of `tools`
4. `memory` stores useful recent context
5. `events` emits lifecycle updates for logs/observability

## Package pages

- [/packages/agent](/packages/agent)
- [/packages/llm](/packages/llm)
- [/packages/memory](/packages/memory)
- [/packages/events](/packages/events)
- [/packages/tools/](/packages/tools/)
