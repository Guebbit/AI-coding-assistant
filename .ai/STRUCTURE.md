# AI repository map (brief)

Canonical architecture and package documentation is in `docs/`.

Top-level orientation:

- `apps/api/` — HTTP API endpoints and wiring
- `packages/` — agent, tools, memory, llm, orchestrator, shared modules
- `tests/` — unit, integration, eval suites
- `docs/` — **canonical documentation source of truth**
- `.ai/` — brief AI-only context helpers

Common edit targets:

- API behavior: `apps/api/` + `packages/`
- Tool behavior: `packages/tools/` + `apps/api/agents.ts`
- Documentation updates: `docs/` (authoritative), then keep `.ai/*` minimal
