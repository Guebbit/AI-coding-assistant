# Changelog

All notable changes to the Manna AI Agent Platform are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

> **Versioning note**: The project is in **alpha**. All versions use the `0.x.0-alpha` scheme until the first stable release (`1.0.0`).

---

## [Unreleased]

### Added
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
