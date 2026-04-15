# Changelog

All notable changes to the Manna AI Agent Platform are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

> **Versioning note**: The project is in **alpha**. All versions use the `0.x.0-alpha` scheme until the first stable release (`1.0.0`).

---

## [Unreleased]

### Added

- **Knowledge graph layer (GraphRAG)** (`packages/graph/`, `packages/tools/knowledge.graph*.ts`):
  Added a Neo4j-backed knowledge graph as a complementary memory/retrieval channel alongside Qdrant vector search.
  If Neo4j is unreachable, all graph operations fail open (log warning, return safe defaults) and never crash the agent.
    - `packages/graph/types.ts` — `IGraphEntity`, `IGraphRelationship`, `IExtractionResult`, `IGraphQueryResult`, `IKnowledgeGraphIngestResult` types; `EntityType` union.
    - `packages/graph/client.ts` — `getDriver()`, `runCypher()`, `isGraphAvailable()`, `ensureConstraints()`, `closeDriver()`; fail-open Neo4j driver wrapper.
    - `packages/graph/extractor.ts` — `extractEntitiesAndRelationships(text)`; Ollama NER prompt → validated `IExtractionResult`; fail-open.
    - `packages/graph/index.ts` — re-exports all graph symbols.
    - `packages/tools/knowledge.graph.ts` — `knowledge_graph` write tool (requires `allowWrite: true`): extracts entities/relationships from text or a file, MERGEs them into Neo4j.
    - `packages/tools/knowledge.graph.query.ts` — `query_knowledge_graph` read-only tool: entity lookup, relationship listing, and raw read-only Cypher; blocks write operations at the tool level.
    - `apps/api/agents.ts` — `knowledge_graph` added to `writeTools`; `query_knowledge_graph` added to `readOnlyTools`.
    - `packages/tools/index.ts` — exports `knowledgeGraphTool` and `queryKnowledgeGraphTool`.
    - `docker-compose.yml` — Neo4j 5 Community service (`neo4j`) with Bolt (`:7687`) and Browser UI (`:7474`) ports; `neo4j-data` named volume.
    - `.env.example` — `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`, `NEO4J_DATABASE`, `GRAPH_NER_MODEL` documented.
    - `neo4j-driver@6.0.1` added as a runtime dependency.
    - `docs/packages/graph.md` — full documentation page with entity/relationship schema (Mermaid ER diagram), tool reference, 2 example Cypher query chains, graph-vs-vector comparison table, configuration reference, and fail-open guarantee notes.
    - `tests/unit/graph/extractor.test.ts` — 10 unit tests covering happy-path extraction, entity-type coercion, code-fence stripping, schema mismatch, and fail-open scenarios.
    - `tests/unit/graph/client.test.ts` — 7 unit tests covering `isGraphAvailable`, `runCypher` row mapping, and `ensureConstraints` fail-open.

- **LangGraph swarm orchestrator**
    - `packages/orchestrator/state.ts` — `swarmStateAnnotation` (LangGraph `Annotation.Root`) defining the full typed run state.
    - `packages/orchestrator/nodes.ts` — node factory functions: `createDecomposeNode`, `createExecuteSubtasksNode`, `createReviewNode`, `createSynthesizeNode`, and `reviewRouter` conditional edge.
    - `packages/orchestrator/graph.ts` — `buildSwarmGraph(tools, processors)` graph builder and `LangGraphSwarmOrchestrator` class (drop-in replacement for the legacy class).
    - `packages/orchestrator/index.ts` — re-exports all public symbols.
    - `apps/api/agents.ts` — `createSwarmOrchestrator()` now returns `LangGraphSwarmOrchestrator`; no API or endpoint changes.
    - `packages/swarm/orchestrator.ts` — `SwarmOrchestrator` marked `@deprecated` with migration notes; retained for staged removal in a follow-up PR.
    - New env var: `SWARM_MAX_REVIEW_RETRIES` (default `1`) — max review→retry cycles before forcing synthesis.
    - Mermaid graph diagram added to `docs/packages/orchestrator.md`.
    - `@langchain/langgraph@1.2.8` and `@langchain/core@1.1.39` added as runtime dependencies.
- **`docs/packages/orchestrator.md`**: Full documentation page for the new LangGraph orchestrator — graph topology diagram, node descriptions, state shape, retry behaviour, usage examples, migration guide, and instructions for adding new nodes.

### Changed

- **`apps/api/agents.ts`**: `createSwarmOrchestrator()` return type changed from `SwarmOrchestrator` to `LangGraphSwarmOrchestrator`. The `run(task, config): Promise<ISwarmResult>` interface is identical — all callers remain backward-compatible.
- **`docs/packages/index.md`** and **`docs/.vitepress/config.mts`**: Added `orchestrator` package to the documentation navigation.
- **`packages/tools/semantic.search.ts`**: migrated `semantic_search` to the canonical `createTool` builder with Zod input schema validation (`query`, optional `documents`, optional `paths`, optional `topK`) while preserving output shape and path/document safety limits.
- **Database query tools** (`packages/tools/mysql.query.ts`, `packages/tools/pg.query.ts`, `packages/tools/mongo.query.ts`): switched from per-call connect/disconnect to lazy shared connection reuse (MySQL pool, PostgreSQL pool, and Mongo connected client) to reduce repeated connection overhead.
- **`packages/processors/tool-reranker.ts`**: moved reranker embedding cache from module-global state to processor-instance scope and rebuilds cache when the processor tool-set signature changes.
- **`packages/agent/model-router.ts`**: made `code` vs `reasoning` default option profiles meaningfully distinct and tightened code keyword heuristics to avoid over-routing generic `api`/`sql` mentions.

### Deprecated

- **`packages/swarm/orchestrator.ts`** — `SwarmOrchestrator` is deprecated. Use `LangGraphSwarmOrchestrator` from `packages/orchestrator/graph.ts`. Will be removed in a follow-up cleanup PR.

### Fixed

- **`packages/memory/memory.ts` — `ensureCollection()` type error**: The `ensureCollectionPromise` assignment now correctly resolves to `Promise<void>` by chaining `.then(() => undefined)` after the Qdrant client call, eliminating a TypeScript type mismatch (`Promise<boolean | CollectionInfo>` is not assignable to `Promise<void>`).

### Added

- **CORS middleware** (`apps/api/index.ts`): Added `cors` middleware to the Express server so that the Manna frontend (and any browser client) can make requests to the API without CORS errors. The allowed origin is configurable via the `CORS_ORIGIN` environment variable (defaults to `*` for local development; set to a specific origin such as `https://manna.example.com` in production). Preflight `OPTIONS` requests and SSE streaming endpoints are handled automatically.
- **Workflow orchestration** (`apps/api/workflow-endpoints.ts`): New `POST /workflow` and `POST /workflow/stream` endpoints for sequential multi-step agent orchestration.
    - Accepts `steps: string[]` — an explicit ordered list of task strings.
    - Each step is executed as a **bounded independent `agent.run()` sub-call**; a slow or failing step does not consume the budget of subsequent steps.
    - **Per-step iteration cap** (`maxStepsPerStep`: 1–100, default `AGENTS_MAX_STEPS`): each step gets its own loop budget, independently of all other steps.
    - **Context carry modes** (`carry: "none" | "summary" | "full"`, default `"summary"`):
        - `none` — steps are fully isolated.
        - `summary` — a compact bullet-list summary of prior results is prepended to each subsequent step prompt.
        - `full` — complete verbatim output of every prior step is appended.
    - Forwards `allowWrite` and `profile` consistently with existing `/run` endpoints.
    - Zod-validated request schema with clear 400 errors (`details` array of validation messages).
    - Non-streaming response returns `{ steps, allSucceeded, totalDurationMs }` with per-step `{ index, task, result, success, durationMs, error? }`.
    - Streaming response (`POST /workflow/stream`) emits SSE events: `workflow_start`, `step_start`, `step`, `tool`, `route`, `step_done`, `done`, `error`.
    - Reuses `createAgent()`, `VALID_PROFILES`, and the global event bus from existing infrastructure; no agent code duplication.
- **`Agent.run()` — `maxSteps` option**: The `options` parameter now accepts an optional `maxSteps: number` field that overrides the global `AGENTS_MAX_STEPS` env var for that specific run. Fully backward-compatible — existing callers that omit `maxSteps` are unaffected.
- **`openapi.yaml` — `RunRequest.allowWrite` description**: Updated to mention all three tools unlocked by `allowWrite: true` — `write_file`, `scaffold_project`, and `document_ingest` (the third was previously omitted).
- **`openapi.yaml` — `/health` response schema**: Added missing `timestamp` field (`type: string, format: date-time`) to match the actual implementation which returns `{ status: "ok", timestamp: new Date().toISOString() }`.
- **`openapi.yaml` — `/upload/image-classify` model description**: Replaced the hardcoded and inaccurate `llava:13b` default with a generic reference to the `TOOL_VISION_MODEL` environment variable, consistent with `AI_README.md`.

### Added

- **Swarm orchestration** (`packages/swarm/`): Multi-agent task decomposition and execution. Complex tasks are broken into subtasks by an LLM decomposer, each delegated to a specialised `Agent` with its own model profile, then synthesised into a final answer.
    - `packages/swarm/types.ts` — `ISubtask`, `IDecomposition`, `ISubtaskResult`, `ISwarmResult`, `ISwarmConfig`
    - `packages/swarm/decomposer.ts` — `decomposeTask()` with fallback to single-subtask plan
    - `packages/swarm/orchestrator.ts` — `SwarmOrchestrator` class with dependency-aware execution and synthesis
- **Swarm HTTP endpoints** (`apps/api/swarm-endpoints.ts`):
    - `POST /run/swarm` — run a swarm and return the final result as JSON
    - `POST /run/swarm/stream` — run a swarm and stream lifecycle events as SSE
- New env vars: `SWARM_DECOMPOSER_MODEL`, `SWARM_SYNTHESIS_MODEL`
- New event types: `swarm:start`, `swarm:decomposed`, `swarm:subtask_start`, `swarm:subtask_done`, `swarm:subtask_error`, `swarm:done`
- **Informational endpoints** (`apps/api/info-endpoints.ts`): three new lightweight `GET` endpoints that require no LLM call:
    - `GET /info/modes` — lists all Manna agent routing profiles (modes) with their resolved Ollama models, controlling env vars, and descriptions.
    - `GET /info/models` — proxies Ollama's `GET /api/tags` and returns all locally available models with size, digest, and detail metadata.
    - `GET /help` — structured JSON overview of every REST API endpoint (method, path, summary, parameters) — the `--help` equivalent for the HTTP API.
- **Phase 1A — `packages/diagnostics/`**: New persistent diagnostic logs package with `IDiagnosticEntry` type, `writeDiagnosticLog()` writer (timestamped Markdown files), and `cleanupOldLogs()` pruner. Controlled by `DIAGNOSTIC_LOG_ENABLED`, `DIAGNOSTIC_LOG_DIR`, `DIAGNOSTIC_LOG_MAX_FILES` env vars.
- **Phase 1B — Budget-ceiling model router**: `routeModel()` now accepts `contextLength` and `cumulativeDurationMs`; `routeWithRules()` applies budget-aware heuristics (context > 80 % ceiling → `reasoning`; duration > 70 % ceiling → `fast`). New env vars: `AGENT_BUDGET_MAX_DURATION_MS` (default 60 000) and `AGENT_BUDGET_MAX_CONTEXT_CHARS` (default 50 000).
- **Phase 2A — Verification gate processor** (`packages/processors/verification.ts`): optional post-tool-choice LLM check; emits `tool:verification_failed`; controlled by `AGENT_VERIFICATION_ENABLED` / `AGENT_VERIFICATION_MODEL`.
- **Phase 2B — Self-debugging on max steps**: when the agent loop exhausts its steps, a fast LLM call generates a structured summary (what was tried, where it got stuck, suggestions). The summary is persisted via `addMemory()` and written to a diagnostic Markdown file. `agent:max_steps` payload now includes `{ task, summary, diagnosticFile }`.
- **Phase 3A — Document ingestion pipeline**: five new read-only reader tools (`read_docx`, `read_csv`, `read_html`, `read_json`, `read_markdown`) and one write tool (`document_ingest`) that chunks, embeds via Ollama, and upserts into Qdrant. New `chunkText()` utility in `packages/shared/chunker.ts`.
- **Phase 3B — SSE streaming endpoint** (`apps/api/stream-endpoints.ts`): `POST /run/stream` streams agent lifecycle events as Server-Sent Events (step, tool, route, done, error, max_steps). The original `POST /run` is unchanged.
- **Phase 4A — Tool reranker processor** (`packages/processors/tool-reranker.ts`): embeds tool descriptions once, then per-step selects the top-N most relevant tools by cosine similarity. Controlled by `TOOL_RERANKER_ENABLED` / `TOOL_RERANKER_TOP_N`.

### Changed

- `apps/api/agents.ts`: extracted `buildProcessors()` helper; added `createSwarmOrchestrator()` factory; imports `SwarmOrchestrator` and `Processor` types.
- `apps/api/index.ts`: registers swarm routes via `registerSwarmRoutes(app)` and info routes via `registerInfoRoutes(app)`.
- `apps/api/agents.ts`: now imports and registers verification and tool-reranker processors; includes all new document reader tools in `readOnlyTools`; adds `document_ingest` to `writeTools`.
- `packages/agent/agent.ts`: accumulates `IDiagnosticEntry[]` during the loop; passes budget state to `routeModel()`; writes diagnostic log on both success (when entries exist) and max-steps exhaustion.
- `packages/tools/index.ts`: exports all new tool instances.
- `packages/shared/index.ts`: exports `chunkText`, `IChunk`, `IChunkOptions`.
- `AI_README.md`: updated event bus table, tool registry, directory map, execution graph, processors section, env vars table, invariants, endpoint table, and common modification patterns.

### Visual documentation overhaul

- **Visual documentation overhaul** — Mermaid diagrams added to every documentation page for ADHD-friendly visual navigation
- **TL;DR callout boxes** — every doc page now opens with a one-liner summary in a highlighted `::: tip` box
- **VitePress Mermaid support** — `vitepress-plugin-mermaid` and `mermaid` added as dev dependencies
- **CHANGELOG.md** — this file, tracking all notable changes going forward
- **`docs/library-ingestion.md`** — deep developer documentation for multi-library ingestion and semantic search: two-pass pipeline, data model, search implementation, API usage, hardware requirements, and edge cases
- **`docs/theory/RAG.md`** — theory page on Retrieval-Augmented Generation: what it is, ingestion/query pipelines, architectures, RAG vs fine-tuning comparison, failure modes
- **`docs/theory/VECTOR_DATABASES.md`** — theory page on vector databases: HNSW/IVF/flat indices, how Qdrant works, practical scaling realities (personal vs. production), embedding model comparison
- **`openapi.yaml`** — OpenAPI 3.1 specification including library endpoints: `GET /library`, `POST /library/{libraryId}/import`, `POST /library/{libraryId}/search`, `GET /library/{libraryId}/export`
- **Developer process rule in `AI_README.md`** — every route addition/modification/removal must update `openapi.yaml` and describe the change in `CHANGELOG.md`
- **Mermaid diagram rule in `AI_README.md`** — coding style now mandates Mermaid diagrams for all pipelines, architectures, and multi-step processes in documentation
- **Mermaid diagrams added** to `docs/theory/RAG.md`, `docs/theory/VECTOR_DATABASES.md`, and `docs/library-ingestion.md` — all ASCII-only diagrams replaced with Mermaid equivalents

### Fixed

- Dead link in `model-selection.md` pointing to `../infra/modelfile-example.md` (now uses VitePress clean URL)

---

## [0.14.0-alpha] — OpenAI-Compatible API Endpoints

### Added

- `GET /v1/models` and `POST /v1/chat/completions` for Open WebUI integration
- Streaming (SSE) and non-streaming response support
- Write mode via `[WRITE]` message prefix or `allowWrite` body field
- Flagged as temporary — to be removed when custom frontend ships

---

## [0.13.0-alpha] — File Upload Support

### Added

- `POST /upload/image-classify` — classify images via multipart upload
- `POST /upload/speech-to-text` — transcribe audio via multipart upload
- `POST /upload/read-pdf` — extract PDF text via multipart upload
- Max upload size: 50 MB

---

## [0.12.0-alpha] — Generate Diagram Tool

### Added

- `generate_diagram` tool — produces Mermaid diagrams rendered via `@mermaid-js/mermaid-cli`

---

## [0.11.0-alpha] — SOLID Refactor & JSDoc

### Changed

- Extracted shared env/path helpers across packages
- Added comprehensive JSDoc to tools, processors, evals, memory, API files

---

## [0.10.0-alpha] — Endpoint Map Documentation

### Added

- `docs/endpoint-map.md` — authoritative reference for every HTTP endpoint

---

## [0.9.0-alpha] — Per-Profile & Per-Tool Runtime Options

### Added

- Env vars for temperature, top_p, top_k, num_ctx, repeat_penalty per agent profile
- Env vars for tool-specific models (vision, STT, IDE, diagram)

---

## [0.8.0-alpha] — AI_README & Model Routing

### Added

- `AI_README.md` — machine-oriented codebase reference for AI agents
- Frontend can now override model routing profile per request
- Default router model set to `phi4-mini`

---

## [0.7.0-alpha] — Manna Rebrand & Documentation Expansion

### Changed

- Rebranded project to "Manna — Personal AI Agent Platform"

### Added

- Scenarios (learn-by-doing drills) and theory pages

---

## [0.6.0-alpha] — IDE Direct Endpoints

### Added

- `POST /autocomplete` — cursor-time code completion with caching
- `POST /lint-conventions` — deterministic + LLM lint findings
- `POST /page-review` — whole-file categorized engineering review

---

## [0.5.0-alpha] — Structured Logging

### Added

- `winston`-based structured logging with env-driven configuration

---

## [0.4.0-alpha] — VitePress Documentation Site

### Added

- VitePress docs site under `/docs`

---

## [0.3.0-alpha] — Qdrant Hybrid Memory

### Changed

- Replaced pure in-memory ring buffer with Qdrant vector DB + local buffer hybrid
- Graceful fallback to local-only when Qdrant is unavailable

---

## [0.2.0-alpha] — Browser Fetch Tool

### Added

- `browser_fetch` tool using Playwright + Chromium (headless)

---

## [0.1.0-alpha] — Initial Release

### Added

- Agentic loop with up to 5 steps per task
- Tool-based architecture: `read_file`, `shell`, `mysql_query`, `browser_fetch`, `image_classify`, `semantic_search`, `speech_to_text`, `read_pdf`, `code_autocomplete`, `write_file`, `scaffold_project`
- Per-step model routing (rules or model-based)
- Event-driven observability system
- Express HTTP API (`POST /run`)
