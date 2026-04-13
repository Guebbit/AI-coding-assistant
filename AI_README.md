# AI_README — Machine-Oriented Codebase Reference

> This file is written for AI models, not humans.
> It is dense, precise, and optimised for fast context-loading by an LLM acting as a coding assistant on this repository.
> Skip pleasantries. Parse facts.
>
> **Mandatory read**: This file MUST be read in full at the start of every session.
> A `.github/copilot-instructions.md` file enforces this for GitHub Copilot automatically.
> If you are another AI agent: read this file before taking any action.

---

## Host Hardware Specs

> These specs define what the local machine can realistically run. Use them when recommending or selecting Ollama models.

| Component | Spec |
|---|---|
| **CPU** | AMD Ryzen 9 9950X3D — 16 cores / 32 threads, base 4.3 GHz (AM5) |
| **RAM** | 32 GB DDR5-6000 CL32 (2 × 16 GB Lexar THOR OC) |
| **GPU** | NVIDIA GeForce RTX 4090 — **24 GB VRAM** (Founders Edition) |
| **Storage (fast)** | 2 TB WD_BLACK SN8100, PCIe 5.0 ×4 NVMe (primary) |
| **Storage (secondary)** | 1 TB Crucial P310, PCIe 4.0 ×4 NVMe |
| **Motherboard** | Asus ROG STRIX X870E-H GAMING WIFI7 (ATX, AM5) |
| **PSU** | Asus ROG THOR P2 1000 W, 80+ Platinum, fully modular |

**Key implication for model selection**: 24 GB VRAM allows running models up to ~13 B parameters in full precision (FP16) or up to ~34 B at 4-bit quantisation (Q4_K_M) entirely on-GPU via Ollama. Larger models will offload layers to RAM (32 GB system RAM available), which degrades throughput. Prefer models that fit fully in VRAM for latency-sensitive paths (fast, ide profiles).

---

## Recommended Models by Profile

> Assign these as the default values for the corresponding env vars. Update this table whenever models change on Ollama.

| Profile / Variable | Recommended model | Rationale |
|---|---|---|
| `OLLAMA_MODEL` (base fallback) | `llama3.1:8b-instruct-q8_0` | Fits in VRAM, good general capability |
| `AGENT_MODEL_FAST` | `llama3.1:8b-instruct-q8_0` | Low latency; fully on-GPU |
| `AGENT_MODEL_REASONING` | `deepseek-r1:32b-qwen-distill-q4_K_M` | 32 B at Q4 fits in 24 GB; strong reasoning |
| `AGENT_MODEL_CODE` | `qwen2.5-coder:14b-instruct-q8_0` | Best code quality that still fits in VRAM |
| `AGENT_MODEL_DEFAULT` | `llama3.1:8b-instruct-q8_0` | Same as FAST; safe fallback |
| `AGENT_MODEL_ROUTER_MODEL` | `phi4-mini:latest` | Fast routing; ~3.8 B params ≈ 2× throughput vs 8 B; model must return valid JSON |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` | Efficient, high-quality embeddings |
| `TOOL_VISION_MODEL` | `llava:13b-v1.6-vicuna-q4_K_M` | Multimodal; 13 B Q4 fits in VRAM |
| `TOOL_STT_MODEL` | `whisper` | No GPU requirement; CPU is fast enough |
| `TOOL_IDE_MODEL` | `qwen2.5-coder:7b-instruct-q8_0` | Sub-100 ms completions; cursor-time latency |
| `TOOL_DIAGRAM_MODEL` | `qwen2.5-coder:14b-instruct-q8_0` | Code-specialised model excels at structured Mermaid syntax generation |

**Rules for recommending models**:
1. Prefer models that fit entirely in 24 GB VRAM (no layer offload).
2. For latency-critical paths (`fast`, IDE), prefer smaller/quantised models over accuracy.
3. For `reasoning`, prefer the largest model that still fits in VRAM at Q4 quantisation.
4. For `code`, prefer a code-specialised model (Qwen-Coder, DeepSeek-Coder, CodeLlama).
5. When a new model replaces an existing one, update this table AND the env var defaults in the Key Environment Variables section.

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
3. `GET /v1/models`, `POST /v1/chat/completions` — OpenAI-compatible endpoints; route Open WebUI (or any OpenAI client) through Manna's full agentic loop.

---

## Execution graph — `POST /run`

```
HTTP POST /run  { task, allowWrite?, profile? }
  └─ apps/api/index.ts
       ├─ validates profile (if present) against fast|reasoning|code|default
       ├─ selects Agent instance (readOnly or writeEnabled)
       └─ agent.run(task, { profile? })
            ├─ getMemory(task)          ← packages/memory/memory.ts
            ├─ emit("agent:start")
            └─ LOOP (max MAX_STEPS, default 5):
                 ├─ processInputStep processors
                 ├─ buildPrompt(task, context, memory)
                 ├─ routeModel(task, context, step, forcedProfile?)
                 │    ├─ if forcedProfile set: return it immediately (no LLM cost)
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
| `image_classify` | `image.classify.ts` | no | Sends image to `TOOL_VISION_MODEL` (default `llava-llama3`); accepts `path` (disk) or `data` (base64) |
| `semantic_search` | `semantic.search.ts` | no | Embeds query via Ollama; scores files via cosine similarity |
| `speech_to_text` | `speech.to.text.ts` | no | Calls `TOOL_STT_MODEL` (default `whisper`); accepts `path` (disk) or `data` (base64) |
| `read_pdf` | `pdf.read.ts` | no | Returns `{ text, pages }`; accepts `path` (disk) or `data` (base64) |
| `code_autocomplete` | `code.autocomplete.ts` | no | IDE-style completion via `TOOL_IDE_MODEL` (default `starcoder2`) |
| `generate_diagram` | `diagram.generate.ts` | no | Generates Mermaid diagrams from descriptions; renders to SVG/PNG via mmdc |
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

> Human-readable reference with full schemas, rate limits, timeouts, curl examples, and a future-endpoint roadmap: `docs/endpoint-map.md`.

---

## Upload endpoints

File: `apps/api/upload-endpoints.ts`
Registered in `apps/api/index.ts` via `registerUploadRoutes(app)`.

These are **not** agent-loop routes. They accept `multipart/form-data` file uploads and call the corresponding tool with inline base64 data.

| Endpoint | Form fields | Purpose |
|---|---|---|
| `POST /upload/image-classify` | `file` (required), `prompt?`, `model?` | Classify/describe an uploaded image via `TOOL_VISION_MODEL` |
| `POST /upload/speech-to-text` | `file` (required), `model?`, `language?`, `prompt?` | Transcribe an uploaded audio file via `TOOL_STT_MODEL` |
| `POST /upload/read-pdf` | `file` (required) | Extract text from an uploaded PDF |

Max upload size: 50 MB. Uses `multer` with in-memory storage.

---

## OpenAI-compatibility endpoints ⚠ TEMPORARY

> **This section describes a temporary Open WebUI bridge.**
> `apps/api/openai-compat.ts` and the `registerOpenAiRoutes(app)` call in `apps/api/index.ts`
> should be **deleted** once the custom Manna frontend is available.
> Do not add new features to this layer.

File: `apps/api/openai-compat.ts`  
Registered in `apps/api/index.ts` via `registerOpenAiRoutes(app)`.

These endpoints implement the OpenAI REST API shape, allowing **Open WebUI** (and any other OpenAI-compatible client) to use Manna as its backend.  Requests pass through the full agentic loop — tools, memory, and model routing are all active.

| Endpoint | Purpose |
|---|---|
| `GET /v1/models` | Lists all Manna model profiles as OpenAI model entries |
| `POST /v1/chat/completions` | Translates an OpenAI chat request → `agent.run()` → OpenAI response format |

**Model → profile mapping**

| Model ID | Manna profile |
|---|---|
| `manna` / `manna-agent` | auto (router decides) |
| `manna-fast` | `fast` |
| `manna-reasoning` | `reasoning` |
| `manna-code` | `code` |

**Write tools**: disabled by default; enabled when `allowWrite: true` is in the body or when the last user message starts with `[WRITE] `.

**Streaming**: `stream: true` is supported — the agent result is buffered and sent as a single SSE chunk followed by `[DONE]`.

> Full schema, curl examples, and env vars: `docs/endpoint-map.md`.

---

## Key environment variables

| Variable | Default | Effect |
|---|---|---|
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama API endpoint |
| `OLLAMA_MODEL` | `llama3` | Base model (fallback for all profiles) |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` | Embedding model for semantic search & memory |
| `AGENT_MODEL_ROUTER_MODE` | `rules` | `rules` or `model` |
| `AGENT_MODEL_ROUTER_MODEL` | `phi4-mini:latest` | Model used when mode=model; also default router when mode=rules falls through |
| `AGENT_MODEL_FAST` | `OLLAMA_MODEL` | Model for fast/simple tasks |
| `AGENT_MODEL_REASONING` | `OLLAMA_MODEL` | Model for multi-step reasoning |
| `AGENT_MODEL_CODE` | `OLLAMA_MODEL` | Model for code tasks |
| `AGENT_MODEL_DEFAULT` | `OLLAMA_MODEL` | Final fallback profile |
| `AGENTS_MAX_STEPS` | `5` | Maximum loop iterations per run |
| `TOOL_VISION_MODEL` | `llava-llama3` | Vision model for `image_classify` |
| `TOOL_STT_MODEL` | `whisper` | Speech-to-text model |
| `TOOL_IDE_MODEL` | `starcoder2` | Completion model for IDE endpoints |
| `TOOL_DIAGRAM_MODEL` | `AGENT_MODEL_CODE` | Model used to generate Mermaid diagram markup |
| `DIAGRAM_OUTPUT_DIR` | `data/diagrams` | Output directory for rendered diagrams |
| `PORT` | `3001` | Express server port |
| `OPENAI_COMPAT_RATE_LIMIT` | `60` | Max `/v1/chat/completions` requests per minute per client IP |
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
│       ├── agents.ts         — shared agent instances (readOnlyAgent, writeEnabledAgent) + createAgent()
│       ├── ide-endpoints.ts  — registerIdeRoutes(); /autocomplete, /lint-conventions, /page-review
│       ├── upload-endpoints.ts — registerUploadRoutes(); /upload/image-classify, /upload/speech-to-text, /upload/read-pdf
│       └── openai-compat.ts  — registerOpenAiRoutes(); GET /v1/models, POST /v1/chat/completions
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
│   │   ├── diagram.generate.ts  — generate_diagram
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
│   ├── diagrams/             — output of generate_diagram (SVG/PNG + .mmd sources)
│   ├── generated-projects/   — output of write_file / scaffold_project
│   └── qdrant/               — Qdrant storage volume
└── docs/                     — VitePress documentation site
    └── endpoint-map.md       — Full API endpoint taxonomy and map (human-readable)
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

---

## Update Protocol — What to do every time the codebase changes

This section defines the **mandatory documentation and configuration actions** the AI must perform whenever the software is modified. These are not optional. They must be executed as part of any change, not after the fact.

---

### Trigger: A model is added, removed, or renamed in Ollama

1. Update the **Recommended Models by Profile** table in this file.
   - Assign the new model to the most appropriate profile(s) based on size, quantisation, and task type.
   - Remove or replace any model that is no longer available.
   - Follow the model-selection rules in that section (VRAM fit, latency vs accuracy trade-offs).
2. Update the **Key Environment Variables** table — adjust the default values in the `Default` column to match.
3. If the new model affects routing logic (e.g., a new code-specialist model), update `packages/agent/model-router.ts` keywords/heuristics to route tasks to it.
4. If `TOOL_VISION_MODEL`, `TOOL_STT_MODEL`, or `TOOL_IDE_MODEL` are affected, update those rows in both the Recommended Models table and the env vars table.
5. Confirm that the suggested model still fits within the 24 GB VRAM constraint (see Host Hardware Specs). If not, prefer the largest Q4_K_M quantisation that fits.

---

### Trigger: A new tool is added to `packages/tools/`

1. Add a row to the **Tool Registry** table:
   - Columns: tool name, file, write access (yes/no), one-line description.
2. Add the file to the **Directory map** under `packages/tools/`.
3. Update the **Adding a new tool — minimal steps** section if the registration pattern has changed.
4. Determine the preferred model for this tool:
   - Tools that are latency-sensitive (IDE, autocomplete) → `TOOL_IDE_MODEL` / `fast` profile.
   - Tools that are compute-intensive or multimodal (vision, STT, PDF reasoning) → dedicated `TOOL_*_MODEL` env var; document it in Key Environment Variables.
   - Tools that require deep reasoning (semantic search, code analysis) → `code` or `reasoning` profile.
   - Add the env var and its recommended default to the **Key Environment Variables** table.
5. If the tool requires `allowWrite: true`, note that in the Tool Registry and in the Invariants section.
6. Update `MAX_STEPS` recommendation in this file if the tool is multi-step by nature (e.g., agentic browser navigation): suggest a higher `AGENTS_MAX_STEPS` value.

---

### Trigger: A tool is removed or renamed

1. Remove its row from the **Tool Registry** table.
2. Remove its entry from the **Directory map**.
3. Remove any dedicated env var it introduced from the **Key Environment Variables** table.
4. Remove any routing keywords associated with it in `packages/agent/model-router.ts` notes here.

---

### Trigger: A new HTTP endpoint is added

1. Add a row to the **IDE direct endpoints** table (or create a new section if it is an agent-loop endpoint).
2. Update the **Execution graph** if the endpoint enters the agent loop.
3. Note any new env vars required; add them to the **Key Environment Variables** table.
4. **Update `openapi.yaml`** — add the new path, its request/response schemas, and any new reusable components. Validate that the file remains valid OpenAPI 3.1.
5. **Update `CHANGELOG.md`** — add a line under `[Unreleased] > Added` (or `Changed` / `Removed` as appropriate) describing the new endpoint, its purpose, and its request/response shape.

---

### Trigger: An existing HTTP endpoint is modified or removed

1. Update the relevant sections in this file (endpoint tables, execution graph if applicable).
2. **Update `openapi.yaml`** — modify or remove the corresponding path entry and any schemas that are no longer valid.
3. **Update `CHANGELOG.md`** — describe what changed and why under the appropriate section (`Changed` or `Removed`).

---

### Trigger: A new environment variable is introduced

1. Add it to the **Key Environment Variables** table with: variable name, default value, and a one-line description of its effect.
2. If it controls model selection, cross-reference it in the **Recommended Models by Profile** table.

---

### Trigger: The directory structure changes (new package, new app, moved files)

1. Update the **Directory map** to reflect the new layout.
2. Update any section that references the moved/renamed file by path.

---

### Trigger: Hardware is upgraded or changed

1. Update the **Host Hardware Specs** table.
2. Re-evaluate the **Recommended Models by Profile** table — VRAM capacity is the primary constraint.
3. Adjust model-selection rules if the new hardware changes what fits in VRAM or changes the latency profile.

---

### General rule for all changes

After any of the above triggers, the AI must:
- Verify that no cross-references in this file are stale (env var names, file paths, tool names).
- Confirm that the **Invariants and safety constraints** section still accurately reflects the code.
- Ensure the **Structured output contract** section matches the current Zod schema in `packages/agent/schemas.ts`.

---

## Coding Style

When writing code in this repository, the AI **must** follow these conventions:

1. **Apply SOLID principles and Uncle Bob (Robert C. Martin) teachings:**
   - **Single Responsibility** — each module, class, and function does one thing.
   - **Open/Closed** — extend behaviour without modifying existing code.
   - **Liskov Substitution** — subtypes must be substitutable for their base types.
   - **Interface Segregation** — prefer small, focused interfaces over large catch-all ones.
   - **Dependency Inversion** — depend on abstractions, not concretions.
   - Keep functions short and focused. Prefer pure functions. Avoid deep nesting.
   - Extract shared logic into dedicated modules (e.g. `packages/shared/`).

2. **Add comprehensive comments** (this overrides the typical Clean Code stance on minimal comments):
   - Every **exported function** must have a JSDoc block explaining what it does, its parameters, and its return value.
   - Every **exported interface / type** must have a JSDoc block describing its purpose and the meaning of each field.
   - Every **module / file** should start with a JSDoc `@module` block summarising the file's responsibility.
   - Internal (non-exported) functions should have at least a one-liner JSDoc if non-trivial.
   - Use `@param`, `@returns`, `@throws`, `@template` tags where applicable.
   - Inline comments within function bodies are welcome for complex or non-obvious logic.

3. **Shared utilities:**
   - Environment variable parsing helpers (`envFloat`, `envInt`) live in `packages/shared/env.ts`.
   - Path safety helpers (`resolveSafePath`, `resolveInsideRoot`) live in `packages/shared/path-safety.ts`.
   - Do **not** duplicate these helpers in individual tool files — import from `packages/shared/`.

4. **Use Mermaid diagrams for visual representations:**
   - When writing or updating documentation (in `docs/`, `AI_README.md`, or `CHANGELOG.md`), include **Mermaid diagrams** (```` ```mermaid ````) for any flow, architecture, sequence, or relationship that benefits from a visual representation.
   - Prefer `flowchart TD` (top-down) or `flowchart LR` (left-right) for pipelines and data flows.
   - Use `sequenceDiagram` for request/response interaction flows.
   - Use `classDiagram` or `erDiagram` for data models or entity relationships.
   - ASCII box-and-arrow diagrams (```` ```text ````) are acceptable as a **compact supplement** when inline with explanatory text, but **every documentation page that describes a pipeline, architecture, or multi-step process must include at least one Mermaid diagram**.
   - VitePress renders Mermaid natively via `vitepress-plugin-mermaid` (already configured in `docs/.vitepress/config.mts`).

---

## Directory map

Updated entry for `packages/shared/`:

```
packages/
  └── shared/
      ├── env.ts          — envFloat(); envInt(); environment variable parsing
      ├── path-safety.ts  — resolveSafePath(); resolveInsideRoot(); directory traversal prevention
      └── index.ts        — re-exports all shared utilities
```
