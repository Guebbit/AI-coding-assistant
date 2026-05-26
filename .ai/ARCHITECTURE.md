# ARCHITECTURE — System Structure & Boundaries

> Defines folder responsibilities, dependency flow, and ownership rules.
> MUST NOT be changed without explicit architectural approval.

---

## System Identity

- **Name**: Manna — Personal AI Agent Platform (local-first, extensible)
- **Type**: Capability-oriented modular monolith (single deployable, NOT microservices)
- **Package**: `@guebbit/manna` (private monorepo, alpha)
- **Entry**: `apps/api/index.ts` (Express, `PORT=3001`)
- **Core endpoint**: `POST /run` (agent loop)
- **Philosophy**: Local-first · No-magic · Observable · Fail-open · Extensible
- **No backward compatibility** — alpha; prefer cleanest SOLID/KISS change over compat shims.

---

## Capability Map (Target Direction)

```
runtime/        → agent, workflows, swarm, policies
knowledge/      → memory, graph, retrieval
documents/      → library, ingestion, parsing, indexing
integrations/   → tools, mcp, llm, browser, db connectors
observability/  → events, logger, diagnostics, evals
platform/       → persistence, config, startup, api support
shared/         → very small, truly generic helpers only
```

This is a documentation and refactoring direction. Today these live under `packages/*`.

---

## Repository Layout

```
apps/api/           Express HTTP layer (routes, middlewares, SSE bridge)
packages/
  agent/            Reason→act→observe loop, model router, vision
  orchestrator/     LangGraph swarm graph (nodes, state)
  swarm/            Task decomposer + swarm result types
  llm/              Ollama client, embeddings, model config
  memory/           Hybrid ring buffer + Qdrant semantic memory
  graph/            Neo4j knowledge graph + NER extractor
  mcp/              MCP loader + health check
  tools/            Native tool implementations
  processors/       Middleware: policy, verification, tool-reranker
  persistence/      PostgreSQL pool, SQL migrations, run history
  library/          Multi-library PDF ingestion + semantic article search
  events/           Synchronous in-process event bus
  logger/           Winston root logger
  diagnostics/      Per-run Markdown diagnostic logs
  evals/            Mastra-style scorers + eval persistence
  shared/           Cross-cutting helpers (env, i18n, sse, path-safety,
                    request-validation, response envelope, operating-mode,
                    chunker, math, mailer, llm-response, model-resolution,
                    language detection, errors, safe-read-file)
tests/unit|integration|evals
docs/               VitePress documentation site
api/                Generated typed API client (from openapi.yaml)
scripts/            Docs coverage + link checkers
data/               Runtime data (e.g. mcp-servers.json)
.ai/                AI operating system (this folder)
```

---

## Dependency Flow (Allowed Import Directions)

```
apps/api/ → packages/* → packages/shared/
```

### Rules

- `apps/api/` MAY import from any `packages/*` module.
- `packages/*` MAY import from `packages/shared/`.
- `packages/*` MAY import from sibling packages when there is a clear domain dependency.
- `packages/shared/` MUST NOT import from any other package.
- `packages/*` MUST NOT import from `apps/`.
- No circular dependencies between packages.

### Forbidden Patterns

- ❌ `packages/tools/` importing from `apps/api/`
- ❌ `packages/shared/` importing from `packages/agent/`
- ❌ Any package importing from `tests/`
- ❌ Circular: `packages/A/` ↔ `packages/B/`

---

## Agent Loop (`packages/agent/agent.ts`)

1. Load relevant memory (ring buffer + Qdrant semantic recall).
2. Run up to `maxSteps` iterations:
   1. `processInputStep` hooks (inject context, filter tools, hard-stop).
   2. Build prompt: task + context + memory + tool catalogue.
   3. Model router selects profile (or honours forced one).
   4. Call LLM; parse with Zod (`agentStepSchema`).
   5. `processOutputStep` hooks (rewrite or block action).
   6. If `action === "none"` → return; else execute tool.
   7. `processToolResult` hooks (error budgets).
   8. Append result + tool citations to context.
3. Return final answer + citations + metadata; persist in PostgreSQL.

---

## Swarm Orchestration (`packages/orchestrator/`)

```
START → decompose → execute_subtasks → review → synthesize → END
                          ↑                │
                          └── retry ◄──────┘
```

- **decompose**: reasoning-profile call → structured subtasks.
- **execute_subtasks**: fresh worker Agent per subtask.
- **review**: retry (up to `SWARM_MAX_REVIEW_RETRIES`) or proceed.
- **synthesize**: combine subtask outputs.

---

## Processor Middleware (`packages/processors/`)

Lifecycle hooks: `processInputStep`, `processOutputStep`, `processToolResult`.
**PolicyProcessor is ALWAYS first.**

| Processor     | Always on? | Role                                           |
| ------------- | ---------- | ---------------------------------------------- |
| Policy        | Yes        | Write-tool denial, error budget, hard-stops    |
| Verification  | Opt-in     | Fast-model "right tool?" check + feedback      |
| Tool reranker | Opt-in     | Cosine-similarity reranks, passes top-N tools  |

---

## Tool Registration (`packages/tools/`, `apps/api/agents.ts`)

- Read-only tools: always registered.
- Write tools (`write_file`, `scaffold_project`, `document_ingest`, `knowledge_graph`): ONLY when `allowWrite: true`.
- `pg_query`, `mongo_query`: exported but NOT wired into runtime — treat as inactive.
- MCP tools: loaded at startup from `data/mcp-servers.json`; fail-open.

---

## Cross-Cutting Invariants

- **Fail-open**: every external dep logs warning and degrades gracefully.
- **Single response envelope**: `successResponse`/`rejectResponse` with `meta` enrichment.
- **Zod boundaries**: LLM outputs, tool inputs, MCP configs, API payloads.
- **Event bus**: `packages/events/bus.ts` → SSE bridge + MongoDB activity log.
- **Path safety**: `shared/path-safety.ts` constrains all filesystem ops.
- **Lazy init**: Postgres pool, Qdrant client, MCP clients connect on first use.
- **No magic**: every decision traceable through structured logs and typed events.

---

## Mental Model

```mermaid
flowchart LR
    User -->|POST /run or /run/swarm| API[Express API]
    API --> Middleware[Helmet / CORS / RateLimit / RequestId]
    Middleware --> Router{Endpoint}
    Router -->|/run| Agent
    Router -->|/run/swarm| Orchestrator[LangGraph Swarm]
    Router -->|/workflow| Workflow[Sequential workflow]
    Router -->|/chat| Chat[Chat persistence]
    Router -->|/library| Library[PDF library]
    Orchestrator --> Agent
    Agent --> Processors[Policy / Verification / Reranker]
    Agent --> LLM[Ollama]
    Agent --> Tools[Native + MCP tools]
    Agent --> Memory[Ring buffer + Qdrant]
    Agent --> KG[Neo4j knowledge graph]
    Agent --> Bus[(Event bus)]
    Agent --> Persistence[(PostgreSQL)]
    Bus --> Logger[Winston]
    Bus --> ActivityLog[(Mongo activity_log)]
    ActivityLog --> HistoryAPI[/history*]
```

---

## Sources of Truth

| Concern             | Authoritative source                       |
| ------------------- | ------------------------------------------ |
| REST API contract   | `openapi.yaml`                             |
| TypeScript config   | `tsconfig.json`                            |
| Linting rules       | `eslint.config.ts`                         |
| Formatting          | `.prettierrc`                              |
| Test config         | `vitest.config.ts`, `vitest.eval.config.ts`|
| Environment vars    | `.env.example`                             |
| MCP servers         | `data/mcp-servers.json`                    |
| SQL migrations      | `packages/persistence/migrations/`         |
| Commit policy       | `commitlint.config.js`                     |
