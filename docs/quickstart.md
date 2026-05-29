# Quickstart: Your First Run

::: tip TL;DR
Three commands to start, one `curl` to prove it works. You only need one Ollama model.
:::

This guide gets you from zero to a working agent response as fast as possible.

```mermaid
flowchart LR
    A["Pull Model"] --> B["Configure .env"]
    B --> C["npm install\nnpm run dev"]
    C --> D["curl POST /run"]
    D --> E["✅ Response"]
    style A fill:#e3f2fd,stroke:#1976d2,color:#0d47a1
    style B fill:#e3f2fd,stroke:#1976d2,color:#0d47a1
    style C fill:#fff3e0,stroke:#e65100,color:#bf360c
    style D fill:#fff3e0,stroke:#e65100,color:#bf360c
    style E fill:#e8f5e9,stroke:#2e7d32,color:#1b5e20
```

---

## Prerequisites

| Tool        | Minimum version   | Install                          |
| ----------- | ----------------- | -------------------------------- |
| **Node.js** | 18+               | [nodejs.org](https://nodejs.org) |
| **Ollama**  | any               | [ollama.com](https://ollama.com) |
| **npm**     | bundled with Node | —                                |

Docker / Qdrant are **not** required for a first run. The agent degrades gracefully when they are absent (local in-memory recall only).

---

## Step 1 — Pull one model

You only need a single Ollama model to start. `llama3.1:8b` is the recommended baseline:

```bash
ollama pull llama3.1:8b
ollama pull nomic-embed-text:latest   # for semantic memory — takes ~300 MB
```

If you have less than 8 GB RAM, use `llama3.2:3b` instead.

---

## Step 2 — Minimal configuration

```bash
cp .env.example .env
```

The only variables you need to touch are already set at the top of `.env.example`:

```bash
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b
OLLAMA_EMBED_MODEL=nomic-embed-text:latest
```

That is it. Leave everything else as-is for a first run.

::: tip Hardware-constrained?
Add `AGENT_OPERATING_MODE=low-spec` to cap the agent at 5 steps and reduce resource usage. See [Operating Modes](./theory/operating-modes.md).
:::

---

## Step 3 — Install and start

```bash
npm install
npm run dev
```

You should see:

```
{"message":"Server started","url":"http://localhost:3001"}
{"message":"ollama_configured","ollamaBaseUrl":"http://localhost:11434"}
```

If the server fails to start, check the error message — it will name the missing variable and link to this guide.

---

## Step 4 — Your first request

```bash
curl -X POST http://localhost:3001/run \
  -H "Content-Type: application/json" \
  -d '{"task":"What test framework does this project use?"}'
```

**Expected response** (formatted for readability):

```json
{
    "success": true,
    "status": 200,
    "message": "",
    "data": {
        "result": "This project uses **vitest** as its test framework..."
    },
    "meta": {
        "startedAt": "2026-05-12T14:00:00.000Z",
        "durationMs": 2100,
        "model": "llama3.1:8b",
        "steps": 2,
        "toolCalls": 1,
        "contextLength": 641
    }
}
```

What happened under the hood:

1. The agent read `package.json` to find the dependencies.
2. It identified `vitest`, composed the answer, and returned.

See the [full example walkthrough](./examples/read-and-answer.md) if you want to understand each step in detail.

---

## Troubleshooting

| Symptom                                               | Likely cause                                | Fix                                                      |
| ----------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------- |
| `Missing required environment variable: OLLAMA_MODEL` | `.env` not copied                           | `cp .env.example .env`                                   |
| `ECONNREFUSED http://localhost:11434`                 | Ollama not running                          | `ollama serve`                                           |
| Response takes > 60 s                                 | Model too large for your RAM                | Use `llama3.2:3b` or add `AGENT_OPERATING_MODE=low-spec` |
| `Unable to resolve model`                             | `OLLAMA_MODEL` is set to a model not pulled | `ollama pull <model>`                                    |
| Empty or garbled answer                               | Weak model                                  | Try a larger or instruction-tuned model                  |

---

## What to try next

All of these work without write access (`allowWrite` defaults to `false`):

```bash
# Explore the project structure
curl -X POST http://localhost:3001/run \
  -H "Content-Type: application/json" \
  -d '{"task":"List all the TypeScript packages in this project and describe what each one does."}'

# Read and reason about a specific file
curl -X POST http://localhost:3001/run \
  -H "Content-Type: application/json" \
  -d '{"task":"Explain what packages/agent/agent.ts does, in plain English."}'

# Inspect scripts and tooling
curl -X POST http://localhost:3001/run \
  -H "Content-Type: application/json" \
  -d '{"task":"What npm scripts are available and what does each one do?"}'

# Understand the API surface
curl -X POST http://localhost:3001/run \
  -H "Content-Type: application/json" \
  -d '{"task":"What HTTP endpoints does this API expose? List them with a one-line description each."}'

# Count and analyse tests
curl -X POST http://localhost:3001/run \
  -H "Content-Type: application/json" \
  -d '{"task":"How many test files are in the tests/ directory? What areas are covered?"}'
```

::: tip Streaming variant
Replace `/run` with `/run/stream` for a [Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events) stream — useful for watching the agent think step by step.
:::

---

## Next steps

| Goal                                      | Go to                                                                                                                  |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Understand the agent loop                 | [Theory: Agent Loop](./theory/agent-loop.md)                                                                           |
| Use a different model per reasoning style | [Model Selection](./model-selection.md)                                                                                |
| Configure hardware-appropriate limits     | [Operating Modes](./theory/operating-modes.md)                                                                         |
| Enable write tools                        | [Use Case 2: Agentic Programming](./use-the-application.md#use-case-2-agentic-programming-build-websites-and-projects) |
| See all HTTP endpoints                    | [Endpoint Map](./endpoint-map.md)                                                                                      |
| Run hands-on drills                       | [Scenarios](./scenarios/)                                                                                              |
