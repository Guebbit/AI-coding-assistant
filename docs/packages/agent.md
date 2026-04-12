# agent — The Brain

## What

Makes decisions in a loop and routes each step to the most appropriate model profile.

## Role

**Think → Pick a tool → Run the tool → Think again**

## Repeats

Up to **5 steps** per task.

## Uses

- LLM (`packages/llm`)
- Model router (`packages/agent/src/model-router.ts`)
- Memory (`packages/memory`)
- Tools (`packages/tools`)
- Events (`packages/events`)

## Input/Output contract

- Input: task string from API
- Each LLM step must return strict JSON:
  - `thought`
  - `action`
  - `input`
- Output: final answer string

## Stop conditions

- `action: "none"` => done
- max steps reached => returns fallback message

## Where in code

- `packages/agent/agent.ts`
- `packages/agent/src/model-router.ts`
