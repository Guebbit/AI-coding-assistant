# STACK — Canonical Technology Definitions

> Authoritative reference for all technology choices.
> MUST NOT deviate without explicit approval.

---

## Runtime

| Concern         | Choice                          | Version/Notes                    |
| --------------- | ------------------------------- | -------------------------------- |
| Runtime         | Node.js                         | ≥ 18, pure ESM (`"type": "module"`) |
| Language        | TypeScript                      | 5.8, `strict`, `tsc --noEmit`   |
| Module system   | ESM only                        | No CommonJS                      |
| API framework   | Express                         | 4.x                             |
| Validation      | Zod + `zod-to-json-schema`      | Every LLM/API boundary           |
| LLM provider    | Ollama (local)                  | `packages/llm/ollama.ts`        |
| Embeddings      | Ollama                          | `packages/llm/embeddings.ts`    |
| State machine   | LangGraph (LangChain Core)      | Swarm orchestration only         |
| Vector DB       | Qdrant                          | Semantic memory + RAG            |
| Graph DB        | Neo4j                           | Knowledge graph                  |
| Primary DB      | PostgreSQL                      | Chat, run history, migrations    |
| Activity log    | MongoDB                         | Append-only history store        |
| Tool target DB  | MySQL                           | Query tool only                  |
| Logging         | Winston                         | `packages/logger/logger.ts`     |
| i18n            | i18next                         | User-facing strings              |
| MCP             | MCP SDK (stdio + SSE)           | External tool servers            |
| Browser         | Playwright + Chromium           | `browser_fetch` tool             |
| PDF             | pdf-parse                       | PDF reading                      |
| Email           | Nodemailer                      | Outbound mail tool               |
| HTTP security   | Helmet + CORS + express-rate-limit | Middleware stack              |
| File upload     | Multer                          | Multipart handling               |

---

## Dev Tooling

| Concern        | Choice                    | Config file                  |
| -------------- | ------------------------- | ---------------------------- |
| Build          | `tsc --noEmit`            | `tsconfig.json`              |
| Lint           | ESLint 10 flat config     | `eslint.config.ts`           |
| Format         | Prettier                  | `.prettierrc`                |
| Test           | Vitest                    | `vitest.config.ts`           |
| Eval           | Vitest (separate config)  | `vitest.eval.config.ts`      |
| API contract   | OpenAPI 3.x + Spectral    | `openapi.yaml`, `spectral.yaml` |
| API codegen    | `npm run genapi`          | Generates `api/` client      |
| Commits        | Conventional Commits      | `commitlint.config.js`       |
| Pre-commit     | Husky                     | `.husky/`                    |
| Containers     | Docker / Podman Compose   | `docker-compose.yml`         |
| Docs           | VitePress                 | `docs/`                      |
| Migrations     | Custom SQL runner          | `packages/persistence/migrations/` |

---

## Model Routing

| Profile      | Env override                   | Fallback       |
| ------------ | ------------------------------ | -------------- |
| `fast`       | `AGENT_MODEL_FAST`             | `OLLAMA_MODEL` |
| `reasoning`  | `AGENT_MODEL_REASONING`        | `OLLAMA_MODEL` |
| `code`       | `AGENT_MODEL_CODE`             | `OLLAMA_MODEL` |
| Router model | `AGENT_MODEL_ROUTER_MODEL`     | —              |

- There is **no `default` profile**. Only `fast | reasoning | code`.
- Per-profile sampling: `AGENT_MODEL_<PROFILE>_TEMPERATURE | TOP_P | TOP_K | NUM_CTX | REPEAT_PENALTY`.
- Budget overrides: `AGENT_BUDGET_MAX_DURATION_MS`, `AGENT_BUDGET_MAX_CONTEXT_CHARS`.
- Vision auto-detected from `AGENT_MULTIMODAL_MODELS`; description model: `TOOL_VISION_MODEL`.

---

## Operating Modes

| Mode         | `AGENTS_MAX_STEPS` | `AGENT_MAX_TOOL_CALLS` | `AGENT_CONSECUTIVE_ERROR_LIMIT` |
| ------------ | ------------------ | ---------------------- | ------------------------------- |
| `low-spec`   | (low)              | (low)                  | 2                               |
| `standard`   | (default)          | (default)              | 3                               |
| `high-trust` | (high)             | (high)                 | 5                               |

Set via `AGENT_OPERATING_MODE` env var. Individual env vars override any field.

---

## Banned

- MUST NOT use: CommonJS (`require`), `any` type, `console.log`, raw SQL without parameterization.
- MUST NOT introduce: microservice frameworks, GraphQL, REST alternatives, alternative ORMs.
- MUST NOT add: alternative LLM providers (OpenAI, Anthropic SDKs) without approval.
- MUST NOT use: `axios` (use native fetch or Playwright for browser), `lodash` (use native JS).

---

## NPM Scripts Reference

| Script                  | Purpose                                              |
| ----------------------- | ---------------------------------------------------- |
| `npm run dev`           | `tsx watch apps/api/index.ts`                        |
| `npm run build`         | `tsc --noEmit`                                       |
| `npm run test`          | Vitest (unit + integration)                          |
| `npm run test:eval`     | Eval scorers                                         |
| `npm run lint[:fix]`    | ESLint                                               |
| `npm run lint:openapi`  | Spectral over `openapi.yaml`                         |
| `npm run prettier[:check/:fix]` | Prettier                                    |
| `npm run docs:check`    | Tool-doc coverage + internal docs link check         |
| `npm run db:migrate`    | Apply SQL migrations                                 |
| `npm run genapi`        | Regenerate typed API client from `openapi.yaml`      |
| `npm run complete`      | `build && test && lint:fix && prettier:fix`           |
| `npm run complete:check`| Strict CI gate (+ OpenAPI lint, Prettier check, docs)|
