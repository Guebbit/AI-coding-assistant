# Tool registry + lifecycle

Native tool registry

- `read_file` -> `packages/tools/fs.read.ts` [no]
- `write_file` -> `packages/tools/fs.write.ts` [yes]
- `shell` -> `packages/tools/shell.ts` [no]
- `mysql_query` -> `packages/tools/mysql.query.ts` [no]
- `browser_fetch` -> `packages/tools/browser.ts` [no]
- `image_classify` -> `packages/tools/image.classify.ts` [no]
- `image_sketch` -> `packages/tools/image.sketch.ts` [no]
- `image_colorize` -> `packages/tools/image.colorize.ts` [no]
- `semantic_search` -> `packages/tools/semantic.search.ts` [no]
- `speech_to_text` -> `packages/tools/speech.to.text.ts` [no]
- `read_pdf` -> `packages/tools/pdf.read.ts` [no]
- `code_autocomplete` -> `packages/tools/code.autocomplete.ts` [no]
- `generate_diagram` -> `packages/tools/diagram.generate.ts` [no]
- `scaffold_project` -> `packages/tools/project.scaffold.ts` [yes]
- `read_docx` -> `packages/tools/docx.read.ts` [no]
- `read_csv` -> `packages/tools/csv.read.ts` [no]
- `read_html` -> `packages/tools/html.read.ts` [no]
- `read_json` -> `packages/tools/json.read.ts` [no]
- `read_markdown` -> `packages/tools/markdown.read.ts` [no]
- `document_ingest` -> `packages/tools/document.ingest.ts` [yes]
- `knowledge_graph` -> `packages/tools/knowledge.graph.ts` [yes]
- `query_knowledge_graph` -> `packages/tools/knowledge.graph.query.ts` [no]

Write tools register only when request body has `allowWrite:true`.

Registration locations

- Tool interface: `packages/tools/types.ts`
- Exports: `packages/tools/index.ts`
- Runtime arrays: `apps/api/agents.ts` (`readOnlyTools`, `writeTools`)

Add/remove procedure

- Add: create `packages/tools/<name>.ts` implementing `Tool` -> export in `packages/tools/index.ts` -> register in `apps/api/agents.ts` (read-only vs write list) -> update this file + `.ai/STRUCTURE.md` + `.ai/README.md` invariants if needed
- Remove/rename: update exports + runtime arrays -> update this file + `.ai/STRUCTURE.md` -> remove/rename related env vars in `.ai/ENVVARS.md`

MCP tools

- Bridge files: `packages/mcp/*`
- Config: `data/mcp-servers.json` (template: `.example`)
- Global switch: `MCP_ENABLED=false`
- Runtime namespacing: `mcp_<server>__<tool>`
- Fail-open on missing config/server failures; startup continues
