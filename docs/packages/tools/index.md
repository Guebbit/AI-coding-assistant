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

<details>
<summary>Select a tool to inspect</summary>

### `read_file`
Read UTF-8 files under project root.

### `shell`
Run allowlisted shell commands with timeout.

### `mysql_query`
Execute read-only `SELECT` queries.

### `browser_fetch`
Fetch page title and visible text (Playwright).

</details>

## Security boundaries

- `read_file` blocks traversal outside project root
- `shell` only allows selected base commands
- `mysql_query` only permits `SELECT`
- `browser_fetch` only permits `http`/`https`

## Tool pages

- [/packages/tools/read-file](/packages/tools/read-file)
- [/packages/tools/shell](/packages/tools/shell)
- [/packages/tools/mysql-query](/packages/tools/mysql-query)
- [/packages/tools/browser-fetch](/packages/tools/browser-fetch)
