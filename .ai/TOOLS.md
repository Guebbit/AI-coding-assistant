# AI tools quick context

Source of truth for the tool layer: [`./README.md`](./README.md) §10 (Native tool catalogue).
Long-form per-tool docs: `docs/packages/tools/`.

Capability alignment: `tools` belongs to the **integrations** capability in the
capability-oriented modular monolith map (`docs/theory/capability-modular-monolith.md`).

Implementation pointers:

- Tool interface/types: `packages/tools/types.ts`
- Tool factory: `packages/tools/tool-builder.ts` (`createTool`)
- Tool exports (re-export surface): `packages/tools/index.ts`
- Runtime registration (which tools are active per request): `apps/api/agents.ts`
- Optional processors around tool use: `packages/processors/` (policy / verification / reranker)
- Shared SQL/NoSQL helper: `packages/tools/base-db-tool.ts`

Critical invariants:

- Write-capable tools (`write_file`, `scaffold_project`, `document_ingest`, `knowledge_graph`)
  are registered **only** for requests with `allowWrite: true`. The PolicyProcessor enforces this
  even if the LLM hallucinates a write call.
- `pg_query` and `mongo_query` are exported as `ITool`s but are **not currently wired** into
  the runtime tool set in `apps/api/agents.ts`. Treat them as inactive until added there.
- External MCP tools come from `data/mcp-servers.json`; discovery is fail-open.
