# Environment variable catalog

## Required (startup validation fails without these)

`OLLAMA_MODEL` — **required** base model fallback (no hardcoded default; used as the last resort in the model resolution chain: profile var → AGENT_MODEL_DEFAULT → OLLAMA_MODEL → throw)

## Recommended (warnings on startup if missing)

`OLLAMA_BASE_URL=http://localhost:11434` — Ollama API endpoint
`OLLAMA_EMBED_MODEL` — embeddings model for memory/search (no hardcoded default; embedding calls throw if unset)
`AGENT_MODEL_FAST` — model for fast/simple tasks
`AGENT_MODEL_REASONING` — model for complex reasoning tasks
`AGENT_MODEL_CODE` — model for code-related tasks

## Agent / Router

`AGENT_MODEL_DEFAULT` — secondary fallback model (after profile-specific, before OLLAMA*MODEL)
`AGENT_MODEL_ROUTER_MODEL=phi4-mini:latest` — router model (only used when mode=model)
`AGENTS_MAX_STEPS=20` — max loop iterations
`AGENT_BUDGET*{MAX*DURATION_MS=60000,MAX_CONTEXT_CHARS=50000}`— router budget thresholds (fast downgrade / reasoning upgrade)`AGENT_VERIFICATION*{ENABLED=false,MODEL=AGENT_MODEL_FAST}` — post-tool verification gate/model

## Model resolution chain (per profile)

Resolution order: `AGENT_MODEL_<PROFILE>` → `AGENT_MODEL_DEFAULT` → `OLLAMA_MODEL` → **throw Error**

No hardcoded model names exist anywhere in the codebase.

## Tools / IDE

`TOOL_VISION_MODEL=llava-llama3` — vision model
`IMAGE_PROCESSOR_{URL=http://localhost:5000,TIMEOUT=120000}` — image processor base URL/timeout ms
`TOOL_STT_MODEL=whisper` — speech-to-text model
`TOOL_IDE_MODEL` — IDE completion model (falls back to resolveModel('code') chain)
`TOOL_DIAGRAM_MODEL=AGENT_MODEL_CODE` — Mermaid generation model
`TOOL_RERANKER_{ENABLED=false,TOP_N=10}` — tool reranker enable + retained tool count
`MCP_{ENABLED=true,CONFIG_PATH=data/mcp-servers.json,CONNECT_TIMEOUT_MS=5000}` — MCP loading/config/timeout

## Infrastructure

`DIAGRAM_OUTPUT_DIR=data/diagrams` — diagram output directory
`DIAGNOSTIC_LOG_{ENABLED=true,DIR=data/diagnostics,MAX_FILES=100}` — diagnostic markdown logs + prune threshold
`MANNA_DB_{HOST=localhost,PORT=5432,USER=manna,PASSWORD=,NAME=manna,ENABLED=true}` — persistence DB connection + switch
`SWARM_{DECOMPOSER_MODEL=AGENT_MODEL_REASONING,SYNTHESIS_MODEL=AGENT_MODEL_REASONING,MAX_REVIEW_RETRIES=1}` — swarm model selection + retry cycles
`NEO4J_{URI=bolt://localhost:7687,USER=neo4j,PASSWORD=manna,DATABASE=neo4j}` — graph endpoint/auth/database
`GRAPH_NER_MODEL=AGENT_MODEL_FAST` — NER extraction model
`PORT=3001` — API server port
`MANNA_PORT=3001` — compose API port override; mapped `${MANNA_PORT}:${MANNA_PORT}` and forwarded to container `PORT` for the Express API
`CORS_ORIGIN=*` — allowed CORS origin(s)
`MANNA_{DEFAULT_LOCALE=en,FALLBACK_LOCALE=en}` — locale selection
`RATE_LIMIT_{WINDOW_MS=900000,MAX=100}` — per-IP rate limit window/max
`MYSQL_{HOST,PORT,USER,PASSWORD,DATABASE}=various` — MySQL tool connection
`PG_{HOST=localhost,PORT=5432,USER=postgres,PASSWORD=,DATABASE=}` — PostgreSQL settings for `pg_query`
`MONGO_{URI=mongodb://localhost:27017,DATABASE=}` — Mongo settings for `mongo_query`
`QDRANT_{URL=http://localhost:6333,COLLECTION=agent_memory}` — Qdrant endpoint/collection
`BOILERPLATE_ROOT=data/boilerplates` — `scaffold_project` source
`PROJECT_OUTPUT_ROOT=data/generated-projects` — write/scaffold output root
`SMTP_{HOST=,PORT=587,USER=,PASS=,SENDER=,SECURE=false}` — SMTP config (unset host disables mail)
`LOG_{ENABLED=true,LEVEL=info,PRETTY=false,ERROR_FILE=error.log}` — logging switch/level(`error|warn|info|debug`)/format/error file
