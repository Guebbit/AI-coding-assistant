# Changelog

All notable changes to the Manna AI Agent Platform are documented in this file.

---

## [Unreleased]

### Added
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

## Previous changes (summary from git history)

### OpenAI-Compatible API Endpoints
- Added `GET /v1/models` and `POST /v1/chat/completions` for Open WebUI integration
- Supports streaming (SSE) and non-streaming responses
- Write mode via `[WRITE]` message prefix or `allowWrite` body field
- Flagged as temporary — to be removed when custom frontend ships

### File Upload Support
- Added `POST /upload/image-classify` — classify images via multipart upload
- Added `POST /upload/speech-to-text` — transcribe audio via multipart upload
- Added `POST /upload/read-pdf` — extract PDF text via multipart upload
- Max upload size: 50 MB

### Generate Diagram Tool
- Added `generate_diagram` tool — produces Mermaid diagrams rendered via `@mermaid-js/mermaid-cli`

### SOLID Refactor & JSDoc
- Extracted shared env/path helpers across packages
- Added comprehensive JSDoc to tools, processors, evals, memory, API files

### Endpoint Map Documentation
- Added `docs/endpoint-map.md` — authoritative reference for every HTTP endpoint

### Per-Profile & Per-Tool Runtime Options
- Added env vars for temperature, top_p, top_k, num_ctx, repeat_penalty per agent profile
- Added env vars for tool-specific models (vision, STT, IDE, diagram)

### AI_README & Model Routing
- Added `AI_README.md` — machine-oriented codebase reference for AI agents
- Frontend can now override model routing profile per request
- Default router model set to `phi4-mini`

### Manna Rebrand & Documentation Expansion
- Rebranded project to "Manna — Personal AI Agent Platform"
- Added scenarios (learn-by-doing drills) and theory pages

### IDE Direct Endpoints
- Added `POST /autocomplete` — cursor-time code completion with caching
- Added `POST /lint-conventions` — deterministic + LLM lint findings
- Added `POST /page-review` — whole-file categorized engineering review

### Structured Logging
- Added `winston`-based structured logging with env-driven configuration

### VitePress Documentation Site
- Added VitePress docs site under `/docs`

### Qdrant Hybrid Memory
- Replaced pure in-memory ring buffer with Qdrant vector DB + local buffer hybrid
- Graceful fallback to local-only when Qdrant is unavailable

### Browser Fetch Tool
- Added `browser_fetch` tool using Playwright + Chromium (headless)

### Initial Release
- Agentic loop with up to 5 steps per task
- Tool-based architecture: `read_file`, `shell`, `mysql_query`, `browser_fetch`, `image_classify`, `semantic_search`, `speech_to_text`, `read_pdf`, `code_autocomplete`, `write_file`, `scaffold_project`
- Per-step model routing (rules or model-based)
- Event-driven observability system
- Express HTTP API (`POST /run`)
