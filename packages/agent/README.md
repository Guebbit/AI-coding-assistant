# @ai-assistant/agent

Core reasoning loop used by the API.

## What it does

- Builds a prompt from:
  - user task
  - recent loop context
  - recent memory entries
  - available tool descriptions
- Calls the LLM (`packages/llm`)
- Routes each step to a model profile (`fast`, `reasoning`, `code`, `default`)
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
- `agent:model_routed`
- `tool:result`
- `tool:error`
- `agent:done`
- `agent:error`
- `agent:max_steps`

## Key file

- `agent.ts`
- `model-router.ts`
