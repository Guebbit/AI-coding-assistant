# AI repository map (brief)

Source of truth for architecture: [`./README.md`](./README.md).
Long-form human docs: `docs/` (VitePress).

Top-level orientation:

- `apps/api/` — HTTP API endpoints and wiring
- `packages/` — current implementation modules (capability-oriented direction is runtime / knowledge / documents / integrations / observability / platform / shared)
- `tests/` — unit, integration, eval suites
- `docs/` — VitePress documentation site (downstream of `.ai/README.md`)
- `.ai/` — AI-only context helpers (this folder; `.ai/README.md` is authoritative)
- `openapi.yaml` — REST contract source of truth
- `data/mcp-servers.json` — MCP server configuration

Architecture direction:

- Keep a **capability-oriented modular monolith** (single deployable app, no microservices split at this stage).
- Capability map and links: `docs/theory/capability-modular-monolith.md`

Common edit targets:

- API behavior: `apps/api/` + `packages/`
- Tool behavior: `packages/tools/` + `apps/api/agents.ts` (write tools live behind `allowWrite`)
- API contract: `openapi.yaml` (then `npm run genapi` to refresh `api/`)
- Documentation updates: update `.ai/README.md` first, then mirror into `docs/`
