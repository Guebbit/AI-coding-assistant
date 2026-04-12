# tools — The Toolbox

## What

Tools are the things the agent can **do**, not just think about.

## Role

Agent decides tool + input, runtime executes tool, result returns to agent context.

## Tool contract

Every tool provides:

- `name`
- `description`
- `execute(input)`

## Included tools

- `read_file` — read UTF-8 files under project root
- `shell` — run allowlisted shell commands with timeout
- `mysql_query` — execute read-only `SELECT` queries
- `browser_fetch` — fetch page title and visible text (Playwright)
- `image_classify` — vision model image description/classification
- `semantic_search` — embedding-based semantic ranking for text/files
- `speech_to_text` — audio transcription via Ollama OpenAI-compatible endpoint
- `read_pdf` — PDF text extraction
- `code_autocomplete` — IDE-style code completion
- `write_file` — write UTF-8 files under generated projects root (opt-in write mode only)
- `scaffold_project` — copy a boilerplate template into generated projects root (opt-in write mode only)

## Security boundaries

- `read_file` blocks traversal outside project root
- `shell` only allows selected base commands
- `mysql_query` only permits `SELECT`
- `browser_fetch` only permits `http`/`https`
- `write_file` only writes inside `PROJECT_OUTPUT_ROOT`
- `scaffold_project` only reads inside `BOILERPLATE_ROOT` and writes inside `PROJECT_OUTPUT_ROOT`

## Tool pages

- [/packages/tools/read-file](/packages/tools/read-file)
- [/packages/tools/shell](/packages/tools/shell)
- [/packages/tools/mysql-query](/packages/tools/mysql-query)
- [/packages/tools/browser-fetch](/packages/tools/browser-fetch)
- [/packages/tools/write-file](/packages/tools/write-file)
- [/packages/tools/scaffold-project](/packages/tools/scaffold-project)
- [/packages/tools/image-classify](/packages/tools/image-classify)
- [/packages/tools/semantic-search](/packages/tools/semantic-search)
- [/packages/tools/speech-to-text](/packages/tools/speech-to-text)
- [/packages/tools/read-pdf](/packages/tools/read-pdf)
- [/packages/tools/code-autocomplete](/packages/tools/code-autocomplete)
