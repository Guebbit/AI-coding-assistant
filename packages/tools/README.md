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

## Exports

- `readFileTool`
- `shellTool`
- `mysqlQueryTool`
- `browserTool`
- `Tool` type

## Key files

- `src/types.ts`
- `src/index.ts`
