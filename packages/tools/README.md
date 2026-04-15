# @ai-assistant/tools

Defines the tool contract and bundled tool implementations.

## Tool contract

All tools implement:

- `name` (unique ID)
- `description` (shown to the LLM)
- `execute(input)` (returns JSON-serializable result)

## Database adapter abstraction

All database-backed tools are built on `base-db-tool.ts` which provides the
`createDbTool` factory. Each engine only implements:

- `validateInput` — reject bad/unsafe input before touching the database
- `run` — open connection → execute read-only operation → close in `finally`

See [docs/packages/tools/db-adapters.md](../../docs/packages/tools/db-adapters.md)
for the full guide including how to add new engines.

## Included tools

**Read-only tools**:

- `read_file` — read UTF-8 file content under project root
- `shell` — run allowlisted shell commands with timeout
- `mysql_query` — run read-only `SELECT` queries against MySQL
- `pg_query` — run read-only `SELECT` queries against PostgreSQL (exported but not registered by default)
- `mongo_query` — run read-only `find`/`aggregate` operations against MongoDB (exported but not registered by default)
- `browser_fetch` — fetch title and visible text using Playwright
- `image_classify` — vision-model image classification/description
- `semantic_search` — embedding-based semantic ranking of texts/files
- `speech_to_text` — audio transcription using Ollama OpenAI-compatible endpoint
- `read_pdf` — extract text from PDFs
- `code_autocomplete` — IDE-style completion suggestions
- `generate_diagram` — generate Mermaid diagrams from text descriptions
- `read_docx` — extract text from `.docx` files
- `read_csv` — parse CSV/TSV files
- `read_html` — extract text from HTML files
- `read_json` — read and parse JSON files
- `read_markdown` — read Markdown files
- `query_knowledge_graph` — traverse the Neo4j knowledge graph

**Write tools** (require `allowWrite: true`):

- `write_file` — write UTF-8 file content under generated projects root
- `scaffold_project` — scaffold a project from a boilerplate template
- `document_ingest` — chunk, embed, and upsert a document into Qdrant
- `knowledge_graph` — extract entities and relationships via NER into Neo4j

## Exports

- `readFileTool`
- `writeFileTool`
- `shellTool`
- `mysqlQueryTool`
- `pgQueryTool`
- `mongoQueryTool`
- `browserTool`
- `scaffoldProjectTool`
- `imageClassifyTool`
- `semanticSearchTool`
- `speechToTextTool`
- `readPdfTool`
- `codeAutocompleteTool`
- `generateDiagramTool`
- `readDocxTool`
- `readCsvTool`
- `readHtmlTool`
- `readJsonTool`
- `readMarkdownTool`
- `documentIngestTool`
- `knowledgeGraphTool`
- `queryKnowledgeGraphTool`
- `createTool` (factory)
- `createDbTool` (database factory)
- `validateSqlInput` (shared SQL guard)
- `ITool` type

## Key files

- `types.ts`
- `base-db-tool.ts`
- `index.ts`
