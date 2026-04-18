# Manna AI machine index

MANDATORY: read this file first every session.

Identity

- Repo: `Guebbit/manna`
- Stack: TypeScript (strict), Node.js >=18, ESM (`tsx`)
- Topology: flat monorepo (`apps/`, `packages/`, `tests/`), `@/*` root alias imports

System

- Local-first Ollama agent server (not chatbot UI)
- Endpoints:
    - Agent loop: `POST /run`, stream: `POST /run/stream`
    - Swarm: `POST /run/swarm`, `POST /run/swarm/stream`
    - Workflow: `POST /workflow`, `POST /workflow/stream`
    - IDE direct (no loop): `/autocomplete`, `/lint-conventions`, `/page-review`
    - Info (no LLM): `/info/modes`, `/info/models`, `/help`

Execution graph (`POST /run`)

```text
handler: apps/api/index.ts
input: { task, allowWrite?, profile? }
validate profile in {fast,reasoning,code,default}
agent = select readOnly/writeEnabled by allowWrite
memory = getMemory(task); emit(agent:start)
for step in 1..MAX_STEPS:
  context = processInputStep(context)          // e.g. tool-reranker
  candidateTools = rerank(tools, task+context+memory) or all tools
  model = routeModel(task, context, step, contextLength, cumulativeDurationMs)
    forcedProfile? => return forced model immediately (no LLM router cost)
    else context > 80% budget => reasoning profile
    else duration > 70% budget => fast profile
    else ROUTER_MODEL classifies task (JSON prompt) => profile; failure => fast
  nativeTools? => chatWithMetadata(messages, { tools }) and parse message.tool_calls
  otherwise => untooled prompt expects {"name","arguments"} and validates schema/args
  out = processOutputStep(parsed)              // includes optional AGENT_VERIFICATION_ENABLED gate
  if verification(valid=false): append issue to thought; emit(tool:verification_failed)
  if out.action == "none": addMemory; emit(agent:done); writeDiagnosticLog?; return out.thought
  if out.action unknown: append tool error + diagnostic; continue
  if duplicate(name,args): append dedup warning + continue
  result = tool.execute(out.input)
  if tool.directOutput: return result immediately
  collect result.citations[] into run citation buffer
  append tool result/error + emit(tool:result|tool:error) + diagnostics; continue
loop exhausted => generate self-debug summary (FAST_MODEL) -> addMemory(MAX_STEPS summary) -> writeDiagnosticLog(AI commentary) -> emit(agent:max_steps{task,summary,diagnosticFile}) -> return summary
```

Structured output contract (hard requirement)

```ts
// packages/agent/schemas.ts
{
    thought: string; // min length 1
    action: string; // tool name OR "none"
    input: Record<string, unknown>; // forwarded to tool.execute()
}
```

- Validate with Zod `agentStepSchema`
- Parse failure => append correction context + retry same step slot

Core invariants/safety

- `shell`: allowlist-only commands
- `mysql_query`: `SELECT` only
- `read_*` + `write_file`/`scaffold_project` + `document_ingest`: path-safe under repo root
- Write tools register only when request has `allowWrite:true`
- `knowledge_graph`: write-only tool, fail-open if Neo4j down
- `query_knowledge_graph`: read-only, blocks mutating Cypher keywords, fail-open if Neo4j down
- Unknown tool names: append error + retry, no crash
- Invalid LLM JSON/schema: self-correct + retry, no crash
- Native tool-calling unsupported models automatically use untooled fallback
- Duplicate tool calls are blocked per run via SHA-256 name+args deduplication
- Tool chaining is capped by `AGENT_MAX_TOOL_CALLS`
- Tool citations are flushed in final run output (`result.citations` and response metadata)
- Qdrant/MCP/verification/reranker failures: fail-open, no process crash
- Diagnostic files constrained to `DIAGNOSTIC_LOG_DIR` via safe path checks
- Persistence failures logged/ignored (`.catch()` in run paths), never crash run
- Try to not use try/catch when possible
- Apply SOLID, DRY, KISS and YAGNI best practices

Routing/model fallback summary

- Profiles: `fast|reasoning|code|default`
- Fallback chain per profile: profile var -> `OLLAMA_MODEL` -> throw Error

Update protocol

- model changes -> update `.ai/MODELS.md` + `.ai/ENVVARS.md` defaults
- tool add/remove/rename -> update `.ai/TOOLS.md` + `.ai/STRUCTURE.md` + invariants here
- endpoint changes -> update this file graph/tables + `openapi.yaml` + `CHANGELOG.md`
- env var changes -> update `.ai/ENVVARS.md`
- directory moves -> update `.ai/STRUCTURE.md`
- always recheck structured output contract vs `packages/agent/schemas.ts`
- run `npm run complete:check`

Load-on-demand map

- Model/hardware decisions -> `.ai/MODELS.md`
- Tool inventory/registration/MCP lifecycle -> `.ai/TOOLS.md`
- Environment variables/defaults -> `.ai/ENVVARS.md`
- Directory map/modification patterns/tests -> `.ai/STRUCTURE.md`
- Style/naming/comments/diagram rules -> `.ai/STYLE.md`
