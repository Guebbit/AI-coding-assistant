# @ai-assistant/tools

Defines the tool contract and bundled tool implementations.

## Tool contract

All tools implement:

- `name` (unique ID)
- `description` (shown to the LLM)
- `execute(input)` (returns JSON-serializable result)

## Included tools

- `read_file` — read UTF-8 file content under project root
- `shell` — run allowlisted shell commands with timeout
- `mysql_query` — run read-only `SELECT` queries against MySQL
- `browser_fetch` — fetch title and visible text using Playwright
- `write_file` — write UTF-8 file content under generated projects root
- `scaffold_project` — scaffold a project from a boilerplate template
- `image_classify` — vision-model image classification/description
- `semantic_search` — embedding-based semantic ranking of texts/files
- `speech_to_text` — audio transcription using Ollama OpenAI-compatible endpoint
- `read_pdf` — extract text from PDFs
- `code_autocomplete` — IDE-style completion suggestions

## Exports

- `readFileTool`
- `writeFileTool`
- `shellTool`
- `mysqlQueryTool`
- `browserTool`
- `scaffoldProjectTool`
- `imageClassifyTool`
- `semanticSearchTool`
- `speechToTextTool`
- `readPdfTool`
- `codeAutocompleteTool`
- `Tool` type

## Key files

- `types.ts`
- `index.ts`
