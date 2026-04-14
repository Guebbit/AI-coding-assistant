# Manna — Personal AI Agent Platform

Manna is a local-first, extensible AI agent platform built with TypeScript, Node.js, and Ollama.

It exposes a REST API that runs a multi-step agentic loop with tools, enabling automation across coding, research, data handling, and creative workflows.
Manna is frontend-agnostic: you can build and connect different clients (web, desktop, mobile, CLI, or voice) to the same backend.

## What this project is

Manna is an API (`http://localhost:3001`) that executes tasks through an agent loop:

1. Understand the task
2. Choose the right tool
3. Execute
4. Iterate until completion (or max steps)

By calling Manna's `/run` endpoint, the model can reason over multiple steps and use specialized tools to complete complex goals.

## Current capabilities

- 💻 **Coding**: file operations, shell execution, project scaffolding, autocomplete support
- 🔎 **Research**: web fetching, PDF extraction, semantic search
- 🖼️ **Vision**: image classification and description
- 🎙️ **Audio**: speech-to-text transcription
- 🗄️ **Data**: MySQL read-only querying
- 🧠 **Memory**: short-term ring buffer + semantic recall via Qdrant
- 🧩 **Extensible**: easy to add new tools and domains

## Roadmap direction

Manna is designed as a core intelligence backend with multiple future frontends and domain assistants.
Planned expansions include:

- specialized frontends (web, desktop, CLI, voice)
- an art workflow assistant (sketch and inking support)
- a home assistant interface (voice + automation orchestration)

## Architecture

```text
ai-assistant/
├── apps/
│   └── api/              ← Express API entry point (`POST /run`)
├── packages/
│   ├── agent/            ← Agent loop
│   ├── events/           ← Event bus
│   ├── llm/              ← Ollama wrapper ("lim" in your note likely means this)
│   ├── memory/           ← In-memory short-term memory
│   └── tools/            ← Tool interface + built-in tools
├── docker-compose.yml    ← Ollama + Qdrant compose stack
├── .env.example          ← Compose env template
└── data/                 ← Runtime data (gitignored)
```

## Quick start

### 1) Install dependencies

```bash
npm install
```

### 2) Start Ollama

```bash
cp .env.example .env
# fill LINUX_USERNAME

docker compose --env-file .env up -d
```

- Ollama API: `http://localhost:11434`

### 3) Start this project API

```bash
cd /path/to/ai-assistant
npm run dev
```

Default API URL: `http://localhost:3001`

### 4) Run a task through the agent

```bash
curl -X POST http://localhost:3001/run \
  -H "Content-Type: application/json" \
  -d '{"task":"List files in the current directory"}'
```

Write mode is opt-in per request:

```bash
curl -X POST http://localhost:3001/run \
  -H "Content-Type: application/json" \
  -d '{"task":"Scaffold a new project from template react-ts","allowWrite":true}'
```

## How tools are used

Tools are configured in `apps/api/index.ts` when creating the `Agent`.

<details>
<summary>Current enabled tools (click to expand)</summary>

- `read_file` — read files inside project root
- `shell` — run allowlisted shell commands
- `mysql_query` — run read-only `SELECT` queries
- `browser_fetch` — fetch and summarize web page content
- `image_classify` — classify/describe images with a vision model
- `semantic_search` — rank files/text by semantic similarity
- `speech_to_text` — transcribe audio using an OpenAI-compatible endpoint
- `read_pdf` — extract text from PDFs
- `code_autocomplete` — produce IDE-style completion suggestions
- `write_file` — write files under generated projects root (**disabled by default**)
- `scaffold_project` — copy a boilerplate into generated projects root (**disabled by default**)

</details>

`browser_fetch` is enabled by default.
Chromium is installed automatically during `npm install` via `postinstall`.
`write_file` and `scaffold_project` are available only when request body sets `"allowWrite": true`.

## How the agentic loop works

Implemented in `packages/agent/agent.ts`.

For each task:

1. Build prompt (task + context + memory + tool descriptions)
2. Route the current step to a model profile (`fast`, `reasoning`, `code`, `default`)
3. Ask selected model for strict JSON output: `thought`, `action`, `input`
4. If `action !== "none"`, execute selected tool
5. Append tool result to context
6. Repeat up to max steps (currently 5)
7. Stop when `action: "none"` or max steps reached

Lifecycle events are emitted through `packages/events` and logged by the API.

## Environment variables

### Application/API variables

Used by Node app (shell environment, `.env` loader, container env, etc.):

- `OLLAMA_BASE_URL` (default `http://localhost:11434`)
- `OLLAMA_MODEL` (default `llama3`)
- `OLLAMA_EMBED_MODEL` (default `nomic-embed-text`)
- `AGENT_MODEL_ROUTER_MODE` (`rules` or `model`, default `rules`)
- `AGENT_MODEL_ROUTER_MODEL` (router classifier model for `model` mode)
- `AGENT_MODEL_FAST` (profile model)
- `AGENT_MODEL_REASONING` (profile model)
- `AGENT_MODEL_CODE` (profile model)
- `AGENT_MODEL_DEFAULT` (fallback profile model)
- `TOOL_VISION_MODEL` (default `llava-llama3`)
- `TOOL_STT_MODEL` (default `whisper`)
- `TOOL_IDE_MODEL` (default `starcoder2`)
- `PORT` (default `3001`)
- `MYSQL_HOST` (default `localhost`)
- `MYSQL_PORT` (default `3306`)
- `MYSQL_USER` (default `root`)
- `MYSQL_PASSWORD` (default empty)
- `MYSQL_DATABASE` (default empty)
- `QDRANT_URL` (default `http://localhost:6333`)
- `QDRANT_COLLECTION` (example: `agent_memory`)
- `LOG_ENABLED` (`true`/`false`, default `true`)
- `LOG_LEVEL` (default `info`, for example: `error`, `warn`, `info`, `debug`)
- `LOG_PRETTY` (`true`/`false`, default `false`; when `false`, logs are JSON)
- `BOILERPLATE_ROOT` (default `data/boilerplates`)
- `PROJECT_OUTPUT_ROOT` (default `data/generated-projects`)

### Infra compose variables

`.env` (at the repo root) is only for the compose stack (Ollama + Qdrant), mainly:

- `LINUX_USERNAME`

So yes: currently only compose-specific vars are defined there.
App/API vars are separate and can be exported in your shell or managed with your preferred env workflow.

## Memory now uses Qdrant by default

The memory package now uses a hybrid approach:

- recent in-process ring buffer (up to 20 entries)
- semantic recall from Qdrant using Ollama embeddings

Runtime requirements:

1. Start Qdrant:
    ```bash
    docker run -d \
      --name qdrant \
      -p 6333:6333 \
      -v $(pwd)/data/qdrant:/qdrant/storage \
      qdrant/qdrant
    ```
2. Configure env vars (optional if defaults are fine):
    ```bash
    export QDRANT_URL="http://localhost:6333"
    export QDRANT_COLLECTION="agent_memory"
    export OLLAMA_EMBED_MODEL="nomic-embed-text"
    ```

If Qdrant is unavailable, the app continues with local in-memory recent memory only.

## Why compose has no database

Correct: `docker-compose.yml` does **not** include MySQL.

Reason: MySQL is optional and only needed if you want `mysql_query` to hit a real DB.
You can either:

- point to an external/local MySQL instance via `MYSQL_*`, or
- add a MySQL service to compose if you want everything in one stack.

## Testing

Manna has three test tiers, all based on **Vitest**.

### Unit & integration tests (fast, no external services)

```bash
# Run once
npm test

# Watch mode
npm run test:watch

# With coverage report (HTML + LCOV)
npm run test:coverage
```

These tests cover:

- Core logic: chunker, path-safety, env helpers, event bus
- Agent schemas (Zod validation)
- Model router (rules-based routing, forced profiles, budget heuristics)
- Memory context window optimisation
- Tool builder (schema validation, execute delegation)
- Swarm decomposer (normalisation, fallbacks, cap)
- Agent loop integration (happy path, tool calls, invalid JSON self-correction,
  unknown tools, tool failures, max-steps + self-debug)
- Swarm orchestrator integration (decompose → execute → synthesise,
  dependency ordering, circular-dep recovery, synthesis failure fallback)

### Eval tests (slow, requires live Ollama)

```bash
# Prerequisites: Ollama running at OLLAMA_BASE_URL (default: http://localhost:11434)
npm run test:eval
```

Eval tests are in `tests/evals/` with the `.eval.ts` extension and are
excluded from CI. See [`tests/evals/README.md`](tests/evals/README.md) for details.

---

## Development

```bash
npm run typecheck
npm run build
npm run dev
```

---

## IDE-focused direct endpoints

These endpoints are separate from `/run` and do not use the agent loop:

- `POST /autocomplete` — low-latency cursor-time completion (`prefix` + optional `suffix`)
- `POST /lint-conventions` — deterministic findings first (TypeScript + conventions), then optional LLM enrichment
- `POST /page-review` — full current file/page review with categorized suggestions

Example:

```bash
curl -X POST http://localhost:3001/autocomplete \
  -H "Content-Type: application/json" \
  -d '{"prefix":"function add(a, b) {","suffix":"}","language":"javascript"}'
```

## Package docs

See:

- `packages/README.md`
- `packages/agent/README.md`
- `packages/events/README.md`
- `packages/llm/README.md`
- `packages/memory/README.md`
- `packages/tools/README.md`

## VitePress documentation site

This repository also includes a VitePress docs site in `/docs`.

```bash
npm run docs:dev
npm run docs:build
npm run docs:preview
```
