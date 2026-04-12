# AI_README — Machine-Oriented Codebase Reference

> This file is written for AI models, not humans.
> It is dense, precise, and optimised for fast context-loading by an LLM acting as a coding assistant on this repository.
> Skip pleasantries. Parse facts.

---

## Identity

**Repo**: `Guebbit/AI-coding-assistant`
**Language**: TypeScript (strict mode, ESM modules via `tsx`)
**Runtime**: Node.js ≥ 18
**Package topology**: flat monorepo — no workspaces; `packages/` and `apps/` are imported by relative path, not by npm package name.

---

## What this system is

A **local-first agentic loop** that wraps Ollama-hosted LLMs and exposes them via a small Express HTTP API.
It is NOT a chatbot frontend. It is a **tool-using agent server**.

Two operational surfaces:
1. `POST /run` — triggers the full agentic loop (reason → pick tool → execute → repeat).
2. `POST /autocomplete`, `POST /lint-conventions`, `POST /page-review` — direct IDE endpoints, **bypass** the agent loop entirely.

---

## Execution graph — `POST /run`

```
HTTP POST /run  { task, allowWrite? }
  └─ apps/api/index.ts
       ├─ selects Agent instance (readOnly or writeEnabled)
       └─ agent.run(task)
            ├─ getMemory(task)          ← packages/memory/memory.ts
            ├─ emit("agent:start")
            └─ LOOP (max MAX_STEPS, default 5):
                 ├─ processInputStep processors
                 ├─ buildPrompt(task, context, memory)
                 ├─ routeModel(task, context, step) → { profile, model }
                 │    ├─ mode=rules: keyword + heuristic match
                 │    └─ mode=model: calls ROUTER_MODEL with JSON prompt
                 ├─ generateWithMetadata(prompt, { model })
                 ├─ parse response → agentStepSchema (Zod)
                 │    on parse failure: append correction to context, continue
                 ├─ processOutputStep processors
                 ├─ if action === "none":
                 │    ├─ addMemory(...)
                 │    ├─ emit("agent:done")
                 │    └─ return thought  ← final answer
                 ├─ if action unknown:
                 │    └─ append error to context, continue
                 └─ tool.execute(input)
                      ├─ on success: append result to context, emit("tool:result")
                      └─ on failure: append error to context, emit("tool:error")
            └─ if loop exhausted: emit("agent:max_steps"), return fallback string
```

---

## Structured output contract

Every LLM response in the agent loop is expected to be **strict JSON** matching:

```typescript
// packages/agent/schemas.ts
{
  thought: string;   // chain-of-thought; at least 1 char
  action:  string;   // tool name OR the literal "none"
  input:   Record<string, unknown>;  // forwarded verbatim to tool.execute()
}
```

Validated with Zod (`agentStepSchema`). Failure → context correction → retry (same step slot).

---

## Model routing

File: `packages/agent/model-router.ts`

Profiles: `fast` | `reasoning` | `code` | `default`

Two modes (env `AGENT_MODEL_ROUTER_MODE`):

| Mode | Mechanism | Notes |
|---|---|---|
| `rules` (default) | keyword scan of `task + context` | synchronous, zero LLM cost |
| `model` | calls `ROUTER_MODEL` with a JSON prompt | async, falls back to `default` on error |

Profile resolution (env vars → fallback chain):

```
AGENT_MODEL_CODE      → AGENT_MODEL_DEFAULT → OLLAMA_MODEL → "llama3"
AGENT_MODEL_FAST      → AGENT_MODEL_DEFAULT → OLLAMA_MODEL → "llama3"
AGENT_MODEL_REASONING → AGENT_MODEL_DEFAULT → OLLAMA_MODEL → "llama3"
```

---

## Tool registry

Defined in `packages/tools/`. Each tool satisfies `packages/tools/types.ts`:

```typescript
interface Tool {
  name:        string;
  description: string;
  execute(input: Record<string, unknown>): Promise<unknown>;
}
```

Tools registered per request in `apps/api/index.ts`:

| Tool name | File | Write? | Notes |
|---|---|---|---|
| `read_file` | `fs.read.ts` | no | Sandboxed to project root |
| `write_file` | `fs.write.ts` | **yes** | Writes under `PROJECT_OUTPUT_ROOT` |
| `shell` | `shell.ts` | no | Allowlist-enforced; rejects unsafe commands |
| `mysql_query` | `mysql.query.ts` | no | SELECT-only; rejects non-SELECT SQL |
| `browser_fetch` | `browser.ts` | no | Playwright Chromium; truncates content to 5000 chars |
| `image_classify` | `image.classify.ts` | no | Sends image to `TOOL_VISION_MODEL` (default `llava-llama3`) |
| `semantic_search` | `semantic.search.ts` | no | Embeds query via Ollama; scores files via cosine similarity |
| `speech_to_text` | `speech.to.text.ts` | no | Calls `TOOL_STT_MODEL` (default `whisper`) |
| `read_pdf` | `pdf.read.ts` | no | Returns `{ text, pages }` |
| `code_autocomplete` | `code.autocomplete.ts` | no | IDE-style completion via `TOOL_IDE_MODEL` (default `starcoder2`) |
| `scaffold_project` | `project.scaffold.ts` | **yes** | Copies boilerplate from `BOILERPLATE_ROOT` |

Write tools (`write_file`, `scaffold_project`) are only registered when the request body contains `"allowWrite": true`.

---

## Memory subsystem

File: `packages/memory/memory.ts`

Hybrid approach:

1. **In-process ring buffer** — up to 20 recent entries; always available.
2. **Qdrant vector store** — semantic recall via Ollama embeddings (`OLLAMA_EMBED_MODEL`, default `nomic-embed-text`).

API:
- `getMemory(task: string): Promise<string[]>` — returns relevant past entries.
- `addMemory(entry: string): Promise<void>` — persists after each completed run.

Qdrant is optional. If unreachable, the system silently falls back to the in-process buffer only.

---

## Event bus

File: `packages/events/bus.ts`

Synchronous, typed, in-process pub/sub. No external broker.

```typescript
emit(event: AgentEvent): void
on(type: string | "*", handler: (event: AgentEvent) => void): void
```

Canonical event types emitted during a run:

| Event type | Emitted when |
|---|---|
| `agent:start` | `agent.run()` begins |
| `agent:model_routed` | model profile chosen for this step |
| `agent:step` | LLM response parsed successfully |
| `agent:done` | action === "none", final answer ready |
| `agent:max_steps` | loop exhausted without "none" |
| `agent:error` | LLM call threw |
| `tool:result` | tool executed successfully |
| `tool:error` | tool threw |

The API subscribes to `"*"` and logs all events via `winston`.

---

## Processors (middleware)

File: `packages/processors/`

Optional hooks that intercept each agent step. Registered via `agent.addProcessor(p)`.

```typescript
interface Processor {
  processInputStep?(args: ProcessInputStepArgs):  Promise<ProcessInputStepArgs | void>;
  processOutputStep?(args: ProcessOutputStepArgs): Promise<ProcessOutputStepArgs | void>;
}
```

Processors run **in registration order**. A processor may return a modified args object to influence the agent, or return `void` to leave it unchanged.

---

## LLM package

File: `packages/llm/ollama.ts`

Thin wrapper around the Ollama REST API (`OLLAMA_BASE_URL`, default `http://localhost:11434`).

Key exports:
- `generate(prompt, options)` — raw string response.
- `generateWithMetadata(prompt, options)` — returns `{ response, model, done, doneReason, totalDurationNs, ... }`.

Models are addressed by string name. No provider abstraction; Ollama is the only supported backend.

---

## IDE direct endpoints

File: `apps/api/ide-endpoints.ts`  
Registered in `apps/api/index.ts` via `registerIdeRoutes(app)`.

These are **not** agent-loop routes. They respond with a single LLM call.

| Endpoint | Input | Purpose |
|---|---|---|
| `POST /autocomplete` | `{ prefix, suffix?, language? }` | Cursor-time code completion via `TOOL_IDE_MODEL` |
| `POST /lint-conventions` | `{ code, language? }` | Deterministic TS/style findings + optional LLM enrichment |
| `POST /page-review` | `{ code, language?, filename? }` | Categorised review suggestions for a full file |

---

## Key environment variables

| Variable | Default | Effect |
|---|---|---|
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama API endpoint |
| `OLLAMA_MODEL` | `llama3` | Base model (fallback for all profiles) |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` | Embedding model for semantic search & memory |
| `AGENT_MODEL_ROUTER_MODE` | `rules` | `rules` or `model` |
| `AGENT_MODEL_ROUTER_MODEL` | `AGENT_MODEL_FAST` | Model used when mode=model |
| `AGENT_MODEL_FAST` | `OLLAMA_MODEL` | Model for fast/simple tasks |
| `AGENT_MODEL_REASONING` | `OLLAMA_MODEL` | Model for multi-step reasoning |
| `AGENT_MODEL_CODE` | `OLLAMA_MODEL` | Model for code tasks |
| `AGENT_MODEL_DEFAULT` | `OLLAMA_MODEL` | Final fallback profile |
| `AGENTS_MAX_STEPS` | `5` | Maximum loop iterations per run |
| `TOOL_VISION_MODEL` | `llava-llama3` | Vision model for `image_classify` |
| `TOOL_STT_MODEL` | `whisper` | Speech-to-text model |
| `TOOL_IDE_MODEL` | `starcoder2` | Completion model for IDE endpoints |
| `PORT` | `3001` | Express server port |
| `MYSQL_HOST/PORT/USER/PASSWORD/DATABASE` | various | MySQL connection for `mysql_query` |
| `QDRANT_URL` | `http://localhost:6333` | Qdrant endpoint for semantic memory |
| `QDRANT_COLLECTION` | — | Qdrant collection name |
| `BOILERPLATE_ROOT` | `data/boilerplates` | Source directory for `scaffold_project` |
| `PROJECT_OUTPUT_ROOT` | `data/generated-projects` | Output directory for `write_file` / `scaffold_project` |
| `LOG_ENABLED` | `true` | Toggle logging |
| `LOG_LEVEL` | `info` | `error` / `warn` / `info` / `debug` |
| `LOG_PRETTY` | `false` | `true` = human-readable; `false` = JSON lines |

---

## Directory map

```
/
├── apps/
│   └── api/
│       ├── index.ts          — Express entry; wires all packages; POST /run, GET /health
│       └── ide-endpoints.ts  — registerIdeRoutes(); /autocomplete, /lint-conventions, /page-review
├── packages/
│   ├── agent/
│   │   ├── agent.ts          — Agent class; core loop; buildPrompt(); MAX_STEPS
│   │   ├── model-router.ts   — routeModel(); profile resolution; rules vs model mode
│   │   └── schemas.ts        — agentStepSchema (Zod); AgentStep type
│   ├── events/
│   │   └── bus.ts            — emit(); on(); synchronous typed event bus
│   ├── llm/
│   │   └── ollama.ts         — generate(); generateWithMetadata(); Ollama REST wrapper
│   ├── memory/
│   │   ├── memory.ts         — getMemory(); addMemory(); hybrid ring+Qdrant
│   │   └── types.ts          — memory entry types
│   ├── tools/
│   │   ├── types.ts          — Tool interface
│   │   ├── tool-builder.ts   — helper for constructing Tool objects
│   │   ├── index.ts          — re-exports all tool instances
│   │   ├── fs.read.ts        — read_file
│   │   ├── fs.write.ts       — write_file
│   │   ├── shell.ts          — shell (allowlisted)
│   │   ├── mysql.query.ts    — mysql_query (SELECT-only)
│   │   ├── browser.ts        — browser_fetch (Playwright)
│   │   ├── image.classify.ts — image_classify
│   │   ├── semantic.search.ts— semantic_search
│   │   ├── speech.to.text.ts — speech_to_text
│   │   ├── pdf.read.ts       — read_pdf
│   │   ├── code.autocomplete.ts — code_autocomplete
│   │   └── project.scaffold.ts  — scaffold_project
│   ├── processors/
│   │   ├── types.ts          — Processor interface; ProcessInputStepArgs; ProcessOutputStepArgs
│   │   ├── processor-builder.ts — helper
│   │   └── index.ts
│   ├── evals/
│   │   ├── types.ts          — eval harness types
│   │   ├── scorer-builder.ts
│   │   ├── index.ts
│   │   └── scorers/
│   │       ├── tool-accuracy.ts  — scores whether correct tool was chosen
│   │       └── agent-quality.ts  — scores response quality
│   └── logger/
│       └── logger.ts         — getLogger(name); winston wrapper
├── infra/
│   └── podman/               — docker-compose for Ollama + Open WebUI; no MySQL
├── data/                     — runtime data; gitignored
│   ├── boilerplates/         — template sources for scaffold_project
│   ├── generated-projects/   — output of write_file / scaffold_project
│   └── qdrant/               — Qdrant storage volume
└── docs/                     — VitePress documentation site
```

---

## Invariants and safety constraints

- `shell` tool: only allowlisted commands execute; any other command returns an error without execution.
- `mysql_query` tool: only `SELECT` statements are accepted; any mutating SQL is rejected before reaching the database.
- `read_file` tool: paths are resolved relative to the project root; path traversal outside the root is blocked.
- `write_file` / `scaffold_project`: only accessible when the HTTP request body sets `"allowWrite": true`; these tools are not registered at all in the default agent instance.
- LLM response parsing: invalid JSON or schema mismatch causes a self-correction prompt to be appended to context; it does not crash the loop.
- Unknown tool names: the agent appends an error listing valid tools and retries; no crash.
- Qdrant unavailability: silently degraded to ring-buffer-only memory; no crash.

---

## Adding a new tool — minimal steps

1. Create `packages/tools/<name>.ts` implementing `Tool` (`{ name, description, execute }`).
2. Export the instance from `packages/tools/index.ts`.
3. Import and add to `readOnlyTools` (or `writeTools`) array in `apps/api/index.ts`.
4. No other registration is needed; the agent discovers tools from the array passed to its constructor.

---

## Common modification patterns

| Goal | Files to touch |
|---|---|
| Change max loop iterations | `AGENTS_MAX_STEPS` env var, or `MAX_STEPS` default in `packages/agent/agent.ts` |
| Add a new model profile | `packages/agent/model-router.ts` — extend `ModelProfile`, `resolveModel`, routing logic |
| Add a new HTTP endpoint | `apps/api/ide-endpoints.ts` or `apps/api/index.ts` |
| Change the prompt structure | `Agent.buildPrompt()` in `packages/agent/agent.ts` |
| Intercept/modify steps | Implement `Processor` in `packages/processors/`, register via `agent.addProcessor()` |
| Change memory strategy | `packages/memory/memory.ts` |
| Add an eval scorer | `packages/evals/scorers/` |
