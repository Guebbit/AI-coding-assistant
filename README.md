# AI Coding Assistant

> **Personal Agent System v1** — local-first, extensible, built with TypeScript + Node.js + Ollama.

---

## Architecture

```
ai-assistant/
├── apps/
│   └── api/          ← Express HTTP server (entry point)
├── packages/
│   ├── agent/        ← Core reasoning loop
│   ├── llm/          ← Ollama wrapper
│   ├── tools/        ← Tool implementations
│   ├── memory/       ← In-memory context store
│   └── events/       ← Synchronous event bus
├── infra/
│   └── podman/       ← Docker Compose stack (Ollama + Open WebUI)
├── data/             ← Runtime data (gitignored)
├── package.json
└── tsconfig.json
```

---

## Quick Start

### Prerequisites

- **Node.js ≥ 18**
- **Ollama** running locally (or via Docker Compose below)

### 1 — Install dependencies

```bash
npm install
```

### 2 — Start Ollama (GPU-accelerated via Docker Compose)

```bash
cd infra/podman
cp .env.example .env          # fill in LINUX_USERNAME and WEBUI_SECRET_KEY
docker compose --env-file .env up -d
```

Open WebUI is then available at **http://localhost:3000**.

### 3 — Run the API in development mode

```bash
npm run dev
```

The API starts on **http://localhost:3001** (or `PORT` env var).

> **Note:** Port 3000 is used by Open WebUI when running the Docker Compose stack.  
> The API defaults to **3001** to avoid conflict.

### 4 — Send a task

```bash
curl -X POST http://localhost:3001/run \
  -H "Content-Type: application/json" \
  -d '{"task": "List the files in the current directory"}'
```

---

## Environment Variables

| Variable           | Default                     | Description                          |
| ------------------ | --------------------------- | ------------------------------------ |
| `OLLAMA_BASE_URL`  | `http://localhost:11434`    | Ollama API endpoint                  |
| `OLLAMA_MODEL`     | `llama3`                    | Default model to use                 |
| `PORT`             | `3001`                      | HTTP port for the API (3000 is Open WebUI) |
| `MYSQL_HOST`       | `localhost`                 | MySQL host (for `mysql_query` tool)  |
| `MYSQL_PORT`       | `3306`                      | MySQL port                           |
| `MYSQL_USER`       | `root`                      | MySQL user                           |
| `MYSQL_PASSWORD`   | *(empty)*                   | MySQL password                       |
| `MYSQL_DATABASE`   | *(empty)*                   | MySQL database name                  |

---

## Available Tools

| Tool name       | Description                                              |
| --------------- | -------------------------------------------------------- |
| `read_file`     | Read a file from disk (restricted to project root)       |
| `shell`         | Run a whitelisted shell command with a timeout           |
| `mysql_query`   | Execute a read-only `SELECT` query against MySQL         |
| `browser_fetch` | Fetch title + visible text from a URL via Playwright     |

> **Note:** `browser_fetch` requires Playwright browsers.  
> Run `npx playwright install chromium` once before enabling it.

---

## Development

```bash
npm run typecheck   # TypeScript type-check without emitting files
npm run build       # Compile to dist/
npm run dev         # Run the API via tsx (no compilation step)
```

---

## Build Your Own Tool

Every capability is a `Tool` object:

```typescript
import type { Tool } from "./packages/tools/src/types";

export const myTool: Tool = {
  name: "my_tool",
  description: "What it does — seen by the LLM when choosing actions.",
  async execute({ someParam }) {
    // ... do work
    return { result: "..." };
  },
};
```

Register it in `apps/api/src/index.ts`:

```typescript
const agent = new Agent([readFileTool, shellTool, myTool]);
```

---

## Phases Implemented

| Phase | Description                          | Status   |
| ----- | ------------------------------------ | -------- |
| 0     | Principles & project structure       | ✅        |
| 1     | Minimal working core (LLM + API)     | ✅        |
| 2     | Shell, MySQL, Browser tools + Memory | ✅        |
| 3     | Hybrid model strategy (stub)         | 🔜 TODO  |
| 4     | Event-driven system                  | ✅        |
| 5     | Podman / Docker Compose integration  | ✅        |
| 6     | Observability (console logging)      | ✅        |
