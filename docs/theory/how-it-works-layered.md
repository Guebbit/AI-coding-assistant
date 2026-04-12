# How It Works (Layered)

This page is designed for **progressive depth**:

- **Layer 1**: broad mental model
- **Layer 2**: clickable step map
- **Layer 3**: deeper system details
- **Ideas & examples**: practical prompts to explore

## Layer 1 — 30-second view

```text
User sends task
    ↓
API wires up: Agent + LLM + Memory + Tools + Events
    ↓
Agent loop:
  1. Build prompt (task + memory + tool list)
  2. Route this step to best model profile
  3. Ask selected model "what should I do?"
  4. LLM picks a tool + input (or says "done")
  5. Agent runs that tool
  6. Events emit: "step done"
  7. Repeat until: done or max 5 steps
    ↓
Return result to user
```

If this is enough, stop here.

## Layer 2 — Clickable step map

### Entry point

- **User sends task** → API endpoint: [/use-the-application](/use-the-application)
- **API wires components** → package map: [/packages/](/packages/)

### Agent loop steps

1. **Build prompt (task + memory + tool list)**
   - Deep dive: [/theory/prompt-context-memory](/theory/prompt-context-memory)
2. **Route the step to a model profile**
   - Deep dive: [/model-selection](/model-selection)
3. **Ask LLM “what should I do?”**
   - Deep dive: [/packages/llm](/packages/llm)
4. **LLM picks tool + input (or done)**
   - Decision contract: [/packages/agent](/packages/agent)
5. **Agent runs that tool**
   - Agent runtime: [/packages/agent](/packages/agent)
   - Tool catalog: [/packages/tools/](/packages/tools/)
6. **Events emit step progress**
   - Event flow: [/theory/events-observability](/theory/events-observability)
7. **Repeat until done or max 5 steps**
   - Loop mental model: [/theory/agent-loop](/theory/agent-loop)

## Layer 3 — What each block is really doing

- **API** receives `task`, creates runtime dependencies, and calls the agent.
- **Agent** runs a bounded loop (max 5 steps) to avoid runaway behavior.
- **LLM** proposes the next action in strict JSON (`thought`, `action`, `input`).
- **Model router** chooses a profile (`fast` / `reasoning` / `code` / `default`) per step.
- **Tools** perform deterministic operations (read file, shell, SQL, browser fetch).
- **Memory** brings short-term recency + semantic recall into prompt building.
- **Events** provide observable lifecycle signals (`start`, `step`, `tool:*`, `done`).

Use this page like a hub, then open only one deep-dive page at a time.

## Ideas & examples

Try these focused prompts:

1. **Architecture overview**
   - `Explain the flow from POST /run to final answer in 6 bullet points.`
2. **Prompt building focus**
   - `What information is included in each agent prompt and why?`
3. **Tool execution focus**
   - `Show me one example where the agent should use read_file before answering.`
4. **Events focus**
   - `Which events should I monitor to debug a failed tool call?`
5. **Boundaries focus**
   - `Give me an example task that should be rejected by tool safety rules.`

Learning pattern (ADHD-friendly):

- Pick **one** prompt
- Run it
- Check logs/events
- Write **one** takeaway
- Move on
