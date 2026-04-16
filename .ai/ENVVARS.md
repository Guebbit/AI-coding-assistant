# Environment variable catalog

| Variable                                 | Default                     | Effect                                    |
| ---------------------------------------- | --------------------------- | ----------------------------------------- | ---- | ---- | ------ |
| `OLLAMA_BASE_URL`                        | `http://localhost:11434`    | Ollama API endpoint                       |
| `OLLAMA_MODEL`                           | `llama3`                    | Base model fallback                       |
| `OLLAMA_EMBED_MODEL`                     | `nomic-embed-text`          | Embeddings for memory/search              |
| `AGENT_MODEL_ROUTER_MODE`                | `rules`                     | `rules` or `model`                        |
| `AGENT_MODEL_ROUTER_MODEL`               | `phi4-mini:latest`          | Router model                              |
| `AGENT_MODEL_FAST`                       | `OLLAMA_MODEL`              | Fast profile model                        |
| `AGENT_MODEL_REASONING`                  | `OLLAMA_MODEL`              | Reasoning profile model                   |
| `AGENT_MODEL_CODE`                       | `OLLAMA_MODEL`              | Code profile model                        |
| `AGENT_MODEL_DEFAULT`                    | `OLLAMA_MODEL`              | Final model fallback                      |
| `AGENTS_MAX_STEPS`                       | `5`                         | Max loop iterations                       |
| `AGENT_BUDGET_MAX_DURATION_MS`           | `60000`                     | Router fast downgrade threshold budget    |
| `AGENT_BUDGET_MAX_CONTEXT_CHARS`         | `50000`                     | Router reasoning upgrade threshold budget |
| `AGENT_VERIFICATION_ENABLED`             | `false`                     | Enable post-tool verification processor   |
| `AGENT_VERIFICATION_MODEL`               | `AGENT_MODEL_FAST`          | Verification model                        |
| `TOOL_VISION_MODEL`                      | `llava-llama3`              | Vision model                              |
| `IMAGE_PROCESSOR_URL`                    | `http://localhost:5000`     | Image processor service base URL          |
| `IMAGE_PROCESSOR_TIMEOUT`                | `120000`                    | Image processor timeout ms                |
| `TOOL_STT_MODEL`                         | `whisper`                   | Speech-to-text model                      |
| `TOOL_IDE_MODEL`                         | `starcoder2`                | IDE completion model                      |
| `TOOL_DIAGRAM_MODEL`                     | `AGENT_MODEL_CODE`          | Mermaid generation model                  |
| `TOOL_RERANKER_ENABLED`                  | `false`                     | Enable tool reranker processor            |
| `TOOL_RERANKER_TOP_N`                    | `10`                        | Max tools retained when reranking         |
| `MCP_ENABLED`                            | `true`                      | Enable MCP loading                        |
| `MCP_CONFIG_PATH`                        | `data/mcp-servers.json`     | MCP config path                           |
| `MCP_CONNECT_TIMEOUT_MS`                 | `5000`                      | MCP connect/list/call timeout ms          |
| `DIAGRAM_OUTPUT_DIR`                     | `data/diagrams`             | Diagram output directory                  |
| `DIAGNOSTIC_LOG_ENABLED`                 | `true`                      | Enable diagnostic markdown logs           |
| `DIAGNOSTIC_LOG_DIR`                     | `data/diagnostics`          | Diagnostic log directory                  |
| `DIAGNOSTIC_LOG_MAX_FILES`               | `100`                       | Diagnostic prune threshold                |
| `MANNA_DB_HOST`                          | `localhost`                 | Persistence DB host                       |
| `MANNA_DB_PORT`                          | `5432`                      | Persistence DB port                       |
| `MANNA_DB_USER`                          | `manna`                     | Persistence DB user                       |
| `MANNA_DB_PASSWORD`                      | _(empty)_                   | Persistence DB password                   |
| `MANNA_DB_NAME`                          | `manna`                     | Persistence DB name                       |
| `MANNA_DB_ENABLED`                       | `true`                      | Enable persistence DB                     |
| `SWARM_DECOMPOSER_MODEL`                 | `AGENT_MODEL_REASONING`     | Swarm decomposition model                 |
| `SWARM_SYNTHESIS_MODEL`                  | `AGENT_MODEL_REASONING`     | Swarm synthesis model                     |
| `SWARM_MAX_REVIEW_RETRIES`               | `1`                         | Max swarm review/retry cycles             |
| `NEO4J_URI`                              | `bolt://localhost:7687`     | Neo4j endpoint                            |
| `NEO4J_USER`                             | `neo4j`                     | Neo4j user                                |
| `NEO4J_PASSWORD`                         | `manna`                     | Neo4j password                            |
| `NEO4J_DATABASE`                         | `neo4j`                     | Neo4j database                            |
| `GRAPH_NER_MODEL`                        | `AGENT_MODEL_FAST`          | NER extraction model                      |
| `PORT`                                   | `3001`                      | API server port                           |
| `CORS_ORIGIN`                            | `*`                         | Allowed CORS origin(s)                    |
| `MANNA_DEFAULT_LOCALE`                   | `en`                        | Active locale                             |
| `MANNA_FALLBACK_LOCALE`                  | `en`                        | Fallback locale                           |
| `RATE_LIMIT_WINDOW_MS`                   | `900000`                    | Rate-limit window ms                      |
| `RATE_LIMIT_MAX`                         | `100`                       | Max requests per IP/window                |
| `MYSQL_HOST/PORT/USER/PASSWORD/DATABASE` | various                     | MySQL tool connection                     |
| `PG_HOST`                                | `localhost`                 | PostgreSQL host for `pg_query` tool       |
| `PG_PORT`                                | `5432`                      | PostgreSQL port for `pg_query` tool       |
| `PG_USER`                                | `postgres`                  | PostgreSQL user for `pg_query` tool       |
| `PG_PASSWORD`                            | _(empty)_                   | PostgreSQL password for `pg_query` tool   |
| `PG_DATABASE`                            | _(empty)_                   | PostgreSQL DB for `pg_query` tool         |
| `MONGO_URI`                              | `mongodb://localhost:27017` | Mongo URI for `mongo_query` tool          |
| `MONGO_DATABASE`                         | _(empty)_                   | Mongo database for `mongo_query` tool     |
| `QDRANT_URL`                             | `http://localhost:6333`     | Qdrant endpoint                           |
| `QDRANT_COLLECTION`                      | `agent_memory`              | Qdrant collection                         |
| `BOILERPLATE_ROOT`                       | `data/boilerplates`         | `scaffold_project` source                 |
| `PROJECT_OUTPUT_ROOT`                    | `data/generated-projects`   | Write/scaffold output root                |
| `SMTP_HOST`                              | _(empty)_                   | SMTP host; unset disables mail            |
| `SMTP_PORT`                              | `587`                       | SMTP port                                 |
| `SMTP_USER`                              | _(empty)_                   | SMTP user                                 |
| `SMTP_PASS`                              | _(empty)_                   | SMTP password                             |
| `SMTP_SENDER`                            | _(empty)_                   | Default sender                            |
| `SMTP_SECURE`                            | `false`                     | TLS switch                                |
| `LOG_ENABLED`                            | `true`                      | Logging switch                            |
| `LOG_LEVEL`                              | `info`                      | `error                                    | warn | info | debug` |
| `LOG_PRETTY`                             | `false`                     | Pretty vs JSON logs                       |
| `LOG_ERROR_FILE`                         | `error.log`                 | Error file transport path                 |
