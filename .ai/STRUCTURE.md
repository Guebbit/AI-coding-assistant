# Repository structure + change map

Directory map

```text
/
├─ apps/api/{index.ts,agents.ts,stream-endpoints.ts,swarm-endpoints.ts,workflow-endpoints.ts,ide-endpoints.ts,upload-endpoints.ts,info-endpoints.ts,middlewares/{multer.ts,security.ts},types.d.ts}
├─ api/
├─ packages/
│  ├─ agent/{agent.ts,model-router.ts,schemas.ts}
│  ├─ orchestrator/{state.ts,nodes.ts,graph.ts,index.ts}
│  ├─ swarm/{types.ts,decomposer.ts,index.ts}
│  ├─ diagnostics/{types.ts,writer.ts,cleanup.ts,index.ts}
│  ├─ events/bus.ts
│  ├─ llm/{config.ts,embeddings.ts,ollama.ts}
│  ├─ memory/{memory.ts,types.ts}
│  ├─ tools/{types.ts,tool-builder.ts,index.ts,*.tool files}
│  ├─ graph/{types.ts,client.ts,extractor.ts,index.ts}
│  ├─ processors/{types.ts,processor-builder.ts,verification.ts,tool-reranker.ts,index.ts}
│  ├─ mcp/{types.ts,health.ts,loader.ts,index.ts}
│  ├─ shared/{env.ts,path-safety.ts,chunker.ts,response.ts,errors.ts,environment.ts,i18n.ts,mailer.ts,llm-response.ts,math.ts,sse.ts,request-validation.ts,safe-read-file.ts,model-resolution.ts,locales/en.json,index.ts}
│  ├─ evals/{types.ts,scorer-builder.ts,persist.ts,index.ts,scorers/*}
│  ├─ persistence/{types.ts,db.ts,migrate.ts,index.ts,migrations/001_initial.sql}
│  └─ logger/logger.ts
├─ tests/{unit,integration,evals}
├─ data/{boilerplates,mcp-servers.json.example,diagrams,diagnostics,generated-projects,qdrant}
└─ docs/{endpoint-map.md,packages/orchestrator.md}
```

Common modification patterns
| Goal | Primary files |
| --- | --- |
| Change max loop iterations | `AGENTS_MAX_STEPS`; `packages/agent/agent.ts` |
| Add model profile | `packages/agent/model-router.ts` |
| Add HTTP endpoint | `apps/api/*-endpoints.ts`, possibly `apps/api/index.ts` |
| Change prompt | `packages/agent/agent.ts` (`buildPrompt`) |
| Add processor | `packages/processors/*`, register via `agent.addProcessor()` |
| Change memory strategy | `packages/memory/memory.ts` |
| Add eval scorer | `packages/evals/scorers/*` |
| DB run persistence | `packages/persistence/db.ts` |
| DB migrations | `packages/persistence/migrate.ts`, `packages/persistence/migrations/*` |
| Budget thresholds | `AGENT_BUDGET_MAX_DURATION_MS`, `AGENT_BUDGET_MAX_CONTEXT_CHARS` |
| Swarm graph change | `packages/orchestrator/nodes.ts`, `packages/orchestrator/graph.ts` |
| Review/retry logic | `packages/orchestrator/nodes.ts`, `SWARM_MAX_REVIEW_RETRIES` |
| Enable verification | `AGENT_VERIFICATION_ENABLED` (+ optional model var) |
| Enable reranker | `TOOL_RERANKER_ENABLED`, `TOOL_RERANKER_TOP_N` |
| MCP integration | `data/mcp-servers.json`, `packages/mcp/*` |
| Knowledge graph query/ingest | `packages/tools/knowledge.graph*.ts`, `packages/graph/*` |

Test architecture

- `npm test` -> `tests/unit/**/*.test.ts`, `tests/integration/**/*.test.ts`; deps: none (fetch mocked)
- `npm run test:eval` -> `tests/evals/**/*.eval.ts`; deps: Ollama required, Qdrant/PostgreSQL optional
- `npm run test:coverage` -> unit+integration; deps: none
- placement: pure/unit -> `tests/unit/`; HTTP/module integration (mocked fetch) -> `tests/integration/`; live LLM/e2e -> `tests/evals/*.eval.ts`
