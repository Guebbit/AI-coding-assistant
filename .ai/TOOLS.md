# AI tools quick context

Canonical tool documentation is in VitePress:

- `docs/packages/tools/`
- `docs/endpoint-map.md`

AI-only implementation pointers:

- Tool interface/types: `packages/tools/types.ts`
- Tool exports: `packages/tools/index.ts`
- Runtime registration: `apps/api/agents.ts`
- Optional processors around tool use: `packages/processors/`

Critical invariant reminders:

- Write-capable tools are registered only for requests with `allowWrite: true`.
- Keep tool changes aligned with canonical docs in `docs/`.
