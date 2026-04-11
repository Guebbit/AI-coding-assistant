# Model Selection: Who the Agent Is and How to Choose Models

This page integrates the practical guidance from `infra/docs/models.md` and `infra/docs/notes.md`, but aligned to this project runtime.

## Who is the "agent"?

In this repository, the **agent** is not a model by itself.

The agent is the runtime loop in `packages/agent/src/agent.ts`:

- builds prompt (task + memory + context + tool list)
- asks the LLM for JSON (`thought`, `action`, `input`)
- executes tools
- repeats up to max steps

The model is one dependency used by that loop (`packages/llm/src/ollama.ts`).

## Which model is used by default?

Current behavior:

- `DEFAULT_MODEL = process.env.OLLAMA_MODEL ?? "llama3"`
- every loop step uses that same model unless code explicitly passes a different `model` option

So yes: today, one API process normally uses one configured model for all tasks.

## Can I juggle fast vs heavy models automatically?

Not automatically in the current implementation.

Today you can:

1. **Switch globally** by changing `OLLAMA_MODEL`
2. **Run multiple API instances** with different `OLLAMA_MODEL` values and route requests externally
3. **Add model-routing logic in code** (future enhancement)

## Can different models interact in one run?

Not in the current default flow.

A single run calls `generate(...)` without per-step model routing, so one configured model handles the full loop.

If you want "specialist personalities" (planner/coder/reviewer), you need explicit orchestration logic to call different models by role.

## Practical model picks (task-based)

Use this as a quick starting matrix:

- **General assistant:** `llama3.1:8b` or `qwen3:4b`
- **Coding-heavy tasks:** `deepseek-coder-v2:16b` or `qwen3-coder:14b`
- **Reasoning/math-heavy tasks:** `deepseek-r1`
- **Very low VRAM / fastest tests:** `phi3`, `phi4-mini`, `dolphin-phi`
- **Vision (image + text):** `llava-llama3`

Rule of thumb:

1. start with 4B–8B
2. increase size only if quality is not enough
3. prefer coder models for repo work
4. prefer reasoning models for logic/math-heavy prompts

## Local runtime constraints (important)

From `infra/docs/notes.md`, these limits matter in practice:

- quantization (reducing numeric precision of model weights) reduces VRAM usage (quality/speed tradeoff)
- large prompts and outputs increase token/memory pressure
- on constrained hardware, keep:
  - `OLLAMA_MAX_LOADED_MODELS=1`
  - `OLLAMA_NUM_PARALLEL=1`

24 GB VRAM rough guidance:

- usually safe: one 7B–13B quantized model
- risky: 30B quantized
- usually unrealistic locally: 70B

## Recommended workflow for this project

1. pick one baseline model for stability
2. validate your common task set on `/scenarios`
3. if latency is high, downsize model
4. if quality is low, upscale model or switch family
5. only then consider adding multi-model routing in code
