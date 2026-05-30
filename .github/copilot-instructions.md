# Manna — AI Identity Context

> Read this file before every task. It is the minimum context needed to work correctly in this repo.
> Full detail lives in `.ai/` — consult those files for anything not covered here.

---

## What Is Manna

**Personal AI Agent Platform — local-first, extensible.**
Private monorepo (`@guebbit/manna`, alpha). No backward-compatibility guarantees.
Entry point: `apps/api/index.ts` (Express, `PORT=3001`). Core endpoint: `POST /run`.
Contract source of truth: `openapi.yaml` (Spectral-linted).

---

## Repository Layout

```
apps/api/           HTTP layer — routes, middlewares, SSE bridge
packages/
  agent/            Reason → act → observe loop, model router
  orchestrator/     LangGraph swarm (decompose → execute → review → synthesize)
  swarm/            Task decomposer + result types
  llm/              Ollama client + embeddings
  memory/           Ring buffer + Qdrant semantic memory
  graph/            Neo4j knowledge graph + NER
  mcp/              MCP loader (stdio + SSE), fail-open
  tools/            Native tool implementations
  processors/       Middleware: Policy (always first), Verification, Tool-reranker
  persistence/      PostgreSQL pool, SQL migrations, run history
  library/          PDF ingestion + semantic article search
  events/           Synchronous in-process event bus
  logger/           Winston root logger
  diagnostics/      Per-run Markdown diagnostic logs
  evals/            Mastra-style scorers + eval persistence
  shared/           Cross-cutting helpers only (env, i18n, sse, path-safety, …)
tests/unit|integration|evals
docs/               VitePress site
openapi.yaml        REST API contract
.ai/                AI operating system — single source of truth for agent behavior
```

**Dependency direction (strictly enforced):** `apps/api/` → `packages/*` → `packages/shared/`
`packages/shared/` MUST NOT import from any other package. No circular deps.

---

## Tech Stack (non-negotiable)

| Concern | Choice |
|---|---|
| Runtime | Node.js ≥ 18, **pure ESM** (`"type": "module"`) |
| Language | TypeScript 5.8, `strict: true`, `tsc --noEmit` |
| Validation | Zod at every LLM/API/tool boundary |
| API | Express 4.x |
| LLM | Ollama (local) — profiles: `fast` / `reasoning` / `code` |
| Vector DB | Qdrant |
| Graph DB | Neo4j |
| Primary DB | PostgreSQL |
| Activity log | MongoDB |
| Logging | Winston (`packages/logger/logger.ts`) — never `console.log` |
| Testing | Vitest (`vitest.config.ts`) |
| Lint | ESLint 10 flat config (`eslint.config.ts`) |
| Format | Prettier (`.prettierrc`) |
| Commits | Conventional Commits (`commitlint.config.js`) |

**Banned:** `require`/CommonJS, `any` type, `console.log`, raw non-parameterized SQL, `axios`, `lodash`, OpenAI/Anthropic SDKs, GraphQL, microservice frameworks.

---

## Coding Conventions (key points)

- `strict: true` always; `unknown` + type narrowing instead of `any`.
- **Prefer promise chaining** (`.then/.catch/.finally`) over `async/await` for 1–2 awaits.
- **Avoid `try/catch`** unless handling sync throws or complex multi-step transactions.
- Typed errors only: `PolicyViolationError`, `PathSafetyError` — not generic `Error`.
- External deps (Qdrant, Postgres, Neo4j, MCP) MUST fail-open: log warning, degrade gracefully.
- All responses via `successResponse`/`rejectResponse` envelope with `meta` enrichment.
- Use destructured imports: `import { foo } from '...'` not `import * as foo`.
- JSDoc required on all exported functions/types/interfaces.
- Brief theory-level comments on non-trivial internal logic.
- Naming: interfaces `IPascalCase`, enums `EPascalCase`, functions/vars `camelCase`, files `kebab-case.ts`.
- Functions ≤ 50 lines, nesting ≤ 3 levels, early returns preferred.
- Write tools only registered when `allowWrite: true`.
- `packages/shared/` = genuinely generic utilities only; do not bloat it.

---

## Rules (hard constraints)

- MUST NOT modify files outside the declared scope of the current task.
- MUST NOT introduce new dependencies without explicit approval.
- MUST NOT perform large rewrites — implement incrementally.
- MUST NOT assume model names, env vars, API endpoints, tool names, or DB schemas — verify from source files.
- MUST NOT silently change architecture, folder structure, or module responsibilities.
- MUST NOT bypass PolicyProcessor or path-safety checks.
- MUST NOT commit `.env` files, secrets, or hardcoded URLs/ports/model names.
- MUST document new endpoints in `openapi.yaml` before implementation; run `npm run genapi` after changes.
- MUST follow Conventional Commits for all commit messages.

---

## Workflow (every implementation task)

1. **Analyze** — read the task; check architecture/stack/rule constraints.
2. **Plan** — list files to change, describe each change, define acceptance criteria. Stop if architecture changes are needed.
3. **Implement incrementally** — one logical change at a time; build/test after each structural or behavioral change.
4. **Self-review** — no scope drift, no forbidden patterns, naming matches conventions.
5. **Validate** — run the checklist in `.ai/CHECKLISTS/<type>.md`.
6. **Final gate** — `npm run complete:check` MUST pass.

---

## Validation Commands

| Command | Purpose |
|---|---|
| `npm run build` | TypeScript type-check (`tsc --noEmit`) |
| `npm run test` | Vitest unit + integration |
| `npm run lint` | ESLint |
| `npm run prettier:check` | Format check |
| `npm run lint:openapi` | Spectral over `openapi.yaml` |
| `npm run docs:check` | Tool-doc coverage + internal link check |
| `npm run complete:check` | Full CI gate (all of the above) |

---

## Deep-Dive References

| Need | File |
|---|---|
| Behavioral constraints | `.ai/RULES.md` |
| Full tech stack | `.ai/STACK.md` |
| System structure & boundaries | `.ai/ARCHITECTURE.md` |
| Coding standards | `.ai/CONVENTIONS.md` |
| Execution sequence | `.ai/WORKFLOW.md` |
| Validation gates | `.ai/CHECKLISTS/` |
| Task definition template | `.ai/TASKS/TEMPLATE.md` |
| Architecture decisions | `.ai/ADR/` |
