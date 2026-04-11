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

## How tools are used

Tools are configured in `apps/api/src/index.ts` when creating the `Agent`.

Current enabled tools:

- `read_file`
- `shell`
- `mysql_query`

`browser_fetch` exists but is not enabled by default (requires Playwright browser install).

To enable it:

1. Install Chromium for Playwright:
   ```bash
   npx playwright install chromium
   ```
2. Add `browserTool` to the `Agent([...])` tool list in `apps/api/src/index.ts`.

## How the agentic loop works

Implemented in `packages/agent/src/agent.ts`.

For each task:

1. Build prompt (task + context + memory + tool descriptions)
2. Ask LLM for strict JSON output: `thought`, `action`, `input`
3. If `action !== "none"`, execute selected tool
4. Append tool result to context
5. Repeat up to max steps (currently 5)
6. Stop when `action: "none"` or max steps reached

Lifecycle events are emitted through `packages/events` and logged by the API.

## Environment variables

### Application/API variables

Used by Node app (shell environment, `.env` loader, container env, etc.):

- `OLLAMA_BASE_URL` (default `http://localhost:11434`)
- `OLLAMA_MODEL` (default `llama3`)
- `PORT` (default `3001`)
- `MYSQL_HOST` (default `localhost`)
- `MYSQL_PORT` (default `3306`)
- `MYSQL_USER` (default `root`)
- `MYSQL_PASSWORD` (default empty)
- `MYSQL_DATABASE` (default empty)

### Infra compose variables

`infra/podman/.env` is only for the compose stack (Ollama/Open WebUI/model-loader), mainly:

- `LINUX_USERNAME`
- `WEBUI_SECRET_KEY`
- `ENABLE_SIGNUP`

So yes: currently only compose-specific vars are defined there.
App/API vars are separate and can be exported in your shell or managed with your preferred env workflow.

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
