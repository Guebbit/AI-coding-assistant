# AI Coding Assistant

Personal local-first agent system built with TypeScript, Node.js, and Ollama.

## What this project is (and is not)

- **Open WebUI (`http://localhost:3000`)** is a generic chat interface for Ollama models.
- **This project** is an API (`http://localhost:3001`) that runs an **agentic loop** with tools.

If you only use Open WebUI, you are chatting with models directly.
If you call this project's `/run` endpoint, the model can reason over multiple steps and use tools.

## Architecture

```text
ai-assistant/
├── apps/
│   └── api/          ← Express API entry point (`POST /run`)
├── packages/
│   ├── agent/        ← Agent loop
│   ├── events/       ← Event bus
│   ├── llm/          ← Ollama wrapper ("lim" in your note likely means this)
│   ├── memory/       ← In-memory short-term memory
│   └── tools/        ← Tool interface + built-in tools
├── infra/
│   └── podman/       ← Ollama + Open WebUI compose stack
└── data/             ← Runtime data (gitignored)
```

## Quick start

### 1) Install dependencies

```bash
npm install
```

### 2) Start Ollama + Open WebUI

```bash
cd infra/podman
cp .env.example .env
# fill LINUX_USERNAME and WEBUI_SECRET_KEY

docker compose --env-file .env up -d
```

- Open WebUI: `http://localhost:3000`
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
- `TOOL_IDE_MODEL` (default `qwen3-coder:14b`)
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

`infra/podman/.env` is only for the compose stack (Ollama/Open WebUI/model-loader), mainly:

- `LINUX_USERNAME`
- `WEBUI_SECRET_KEY`
- `ENABLE_SIGNUP`

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

Correct: `infra/podman/docker-compose.yml` does **not** include MySQL.

Reason: MySQL is optional and only needed if you want `mysql_query` to hit a real DB.
You can either:

- point to an external/local MySQL instance via `MYSQL_*`, or
- add a MySQL service to compose if you want everything in one stack.

## Development

```bash
npm run typecheck
npm run build
npm run dev
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
