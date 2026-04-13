# Ollama Modelfile Example

::: tip TL;DR
Modelfiles bake parameters into a model. Runtime env vars override them. Runtime always wins.
:::

This is a practical template for creating custom Ollama Modelfiles in this project.

```text
# Base model to derive from
FROM qwen3:4b

# ===== RANDOMNESS / CREATIVITY =====
PARAMETER temperature 0.7
PARAMETER top_p 0.9
PARAMETER top_k 50
PARAMETER min_p 0.05

# ===== REPETITION CONTROL =====
PARAMETER repeat_penalty 1.2
PARAMETER presence_penalty 0.3

# ===== CONTEXT / PERFORMANCE =====
PARAMETER num_ctx 2048

# ===== SYSTEM PROMPT =====
SYSTEM You are a concise, accurate assistant. Prefer short answers.
```

## Runtime options vs Modelfiles

This project supports two complementary ways to control generation parameters:

| Approach | How it works | Best for |
|---|---|---|
| **Modelfile** | Parameters are baked into the derived model at creation time | Permanent, version-controlled defaults; works with Open WebUI and `ollama run` |
| **Runtime options (env vars)** | Parameters are sent with every API call via `options` field | Per-tool or per-profile tuning without creating extra model variants |

**Important:** runtime options always win. If your Modelfile sets `temperature 0.7` but your env var sets `AGENT_MODEL_CODE_TEMPERATURE=0.2`, Ollama will use `0.2` for that call. You can use Modelfiles as a baseline and override selectively at runtime.

See [model-selection.md](../model-selection.md#runtime-options-per-profile) for the full list of runtime option env vars per agent profile, and the individual tool docs for tool-specific options.
