# AI env vars quick context

Source of truth: [`./README.md`](./README.md) §13 + the canonical catalogue in
[`../.env.example`](../.env.example). Long-form per-feature docs in `docs/`.

Capability alignment: env vars configure capabilities within a single modular
monolith runtime (runtime/knowledge/documents/integrations/observability/platform/shared).

AI quick reminders only:

- LLM runtime: `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `OLLAMA_EMBED_MODEL`
- Profile model overrides: `AGENT_MODEL_FAST`, `AGENT_MODEL_REASONING`, `AGENT_MODEL_CODE`, `AGENT_MODEL_ROUTER_MODEL`
- Runtime limits: `AGENTS_MAX_STEPS`, `AGENT_MAX_TOOL_CALLS`, `AGENT_BUDGET_MAX_DURATION_MS`, `AGENT_BUDGET_MAX_CONTEXT_CHARS`
- Operating mode: `AGENT_OPERATING_MODE` (`low-spec` | `standard` | `high-trust`; default `standard`) — sets defaults for `AGENTS_MAX_STEPS`, `AGENT_MAX_TOOL_CALLS`, `AGENT_CONSECUTIVE_ERROR_LIMIT`
- Harness guardrails: `AGENT_CONSECUTIVE_ERROR_LIMIT` (mode defaults 2 / 3 / 5)
- Processors: `AGENT_VERIFICATION_ENABLED`, `AGENT_VERIFICATION_MODEL`, `TOOL_RERANKER_ENABLED`, `TOOL_RERANKER_TOP_N`
- Tooling/infra: `TOOL_VISION_MODEL`, `TOOL_STT_MODEL`, `TOOL_IDE_MODEL`, `TOOL_DIAGRAM_MODEL`, `QDRANT_URL`, `QDRANT_COLLECTION`, `NEO4J_URI/USER/PASSWORD/DATABASE`, `MANNA_DB_*`, `PORT`
- Logging: `LOG_ENABLED`, `LOG_LEVEL`, `LOG_PRETTY`, `LOG_ERROR_FILE`
- Rate limiting: `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`; CORS: `CORS_ORIGIN`
- Swarm: `SWARM_DECOMPOSER_MODEL`, `SWARM_SYNTHESIS_MODEL`, `SWARM_MAX_REVIEW_RETRIES`
- Knowledge graph: `GRAPH_NER_MODEL`

This file is not a full catalogue — trust `.env.example` and `shared/validateRequiredEnvironment()`.
