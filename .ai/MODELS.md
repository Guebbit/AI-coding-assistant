# AI model-routing quick context

Source of truth for the model layer: [`./README.md`](./README.md) §6 (Agent loop)
and §12 (Cross-cutting patterns → profile-based model routing).
Long-form docs: `docs/model-selection.md`, `docs/infra/ollama-models.md`.

Capability alignment: model providers and adapters (`llm`) are part of the
**integrations** capability in the capability-oriented modular monolith map.

AI reminders:

- Supported profiles: `fast | reasoning | code` (there is **no `default` profile**).
- Profile resolution chain: `AGENT_MODEL_<PROFILE>` → `OLLAMA_MODEL` → error.
- Router model env var: `AGENT_MODEL_ROUTER_MODEL`.
- Profile sampling overrides: `AGENT_MODEL_<PROFILE>_TEMPERATURE | TOP_P | TOP_K | NUM_CTX | REPEAT_PENALTY`.
- Budget overrides: `AGENT_BUDGET_MAX_DURATION_MS`, `AGENT_BUDGET_MAX_CONTEXT_CHARS`.
- Vision is auto-detected from `AGENT_MULTIMODAL_MODELS`; description model is `TOOL_VISION_MODEL`.
- Do not assume hardcoded model names — always read `.env.example` and current env.
