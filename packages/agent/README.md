# @ai-assistant/agent

Core reasoning loop used by the API.

## What it does

- Builds a prompt from:
  - user task
  - recent loop context
  - recent memory entries
  - available tool descriptions
- Calls the LLM (`packages/llm`)
- Parses a strict JSON response with:
  - `thought`
  - `action`
  - `input`
- Executes the selected tool (`packages/tools`)
- Appends tool output to context and repeats until:
  - `action: "none"`, or
  - max steps reached (currently 5)

## Observability

Emits lifecycle events through `packages/events`:

- `agent:start`
- `agent:step`
- `tool:result`
- `tool:error`
- `agent:done`
- `agent:error`
- `agent:max_steps`

## Key file

- `src/agent.ts`
