# Model Selection & Routing

This project now supports a **model-routing layer** between the agent loop and Ollama.

## Agent vs model

- **Agent**: orchestration loop (`packages/agent/src/agent.ts`)
- **Router**: per-step model-profile selector (`packages/agent/src/model-router.ts`)
- **Model**: Ollama runtime chosen by router for that step

So, `OLLAMA_MODEL` is not “the agent”. It is only a default model fallback.

## Per-step routing profiles

The router selects one profile at each loop step:

- `fast` → simple/light Q&A
- `reasoning` → hard logic and multi-step analysis
- `code` → coding/refactor/debug tasks
- `default` → safety fallback

## Router modes

Set `AGENT_MODEL_ROUTER_MODE`:

- `rules` (default): deterministic keyword + heuristic routing
- `model`: a fast router model classifies the step and returns a profile

When `model` mode fails, the runtime safely falls back to `default`.

## Router environment variables

- `AGENT_MODEL_ROUTER_MODE` (`rules` | `model`, default `rules`)
- `AGENT_MODEL_ROUTER_MODEL` (tiny classifier model when in `model` mode)
- `AGENT_MODEL_FAST`
- `AGENT_MODEL_REASONING`
- `AGENT_MODEL_CODE`
- `AGENT_MODEL_DEFAULT` (fallback)
- `OLLAMA_MODEL` (global fallback if profile-specific vars are not set)

## Recommended profile mapping (from your installed model set)

- `fast`: `qwen3:4b` (or `phi4-mini`)
- `reasoning`: `deepseek-r1`
- `code`: `qwen3-coder:14b` (or `deepseek-coder-v2:16b`)
- `default`: `llama3.1:8b`
- `router model` (if mode=`model`): `qwen3:4b`

## Tool-specific model vars

1. start with 4B–8B
2. increase size only if quality is not enough
3. prefer coder models for repo work
4. prefer reasoning models for logic/math-heavy prompts

## Runtime constraints

From `infra/docs/notes.md`:

- on constrained hardware, keep `OLLAMA_MAX_LOADED_MODELS=1` and `OLLAMA_NUM_PARALLEL=1`
- start with small/fast models and scale only when quality demands it
