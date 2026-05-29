# Tool: `read_csv`

::: tip TL;DR
Parses CSV/TSV (or custom-delimited) files into a compact text preview plus headers and row count.
:::

## At a glance

- **Input:** `{ "path": "data/table.csv", "delimiter": "," }`
- **Output:** `{ text, headers, rowCount }`
- **When to use:** quick structured inspection of tabular files before deeper analysis.

## Purpose

Read a delimited text file and return a model-friendly preview.

## Input

```json
{ "path": "data/users.csv", "delimiter": "," }
```

`delimiter` is optional and must be one character (`,` by default).

## Output

```json
{
    "text": "id | email | role\n1 | alice@example.com | admin\n2 | bob@example.com | user",
    "headers": ["id", "email", "role"],
    "rowCount": 248
}
```

## Safety

- File reads are sandboxed to project-root-safe paths.
- Output is preview-oriented (header + first rows) to avoid oversized prompts.

## How the agent uses it

```mermaid
flowchart LR
    A[You ask to inspect a CSV] --> B[Agent calls read_csv]
    B --> C[Tool parses rows and headers]
    C --> D[Tool returns preview + metadata]
    D --> E[Agent reasons on top of structured preview]
    style A fill:#e3f2fd,stroke:#1976d2,color:#0d47a1
    style B fill:#fff3e0,stroke:#e65100,color:#bf360c
    style C fill:#fff3e0,stroke:#e65100,color:#bf360c
    style D fill:#fff3e0,stroke:#e65100,color:#bf360c
```

## Good test prompts

| What you type                                           | What the agent does                                       |
| ------------------------------------------------------- | --------------------------------------------------------- |
| `Read data/sales.csv and list the column names.`        | Calls `read_csv`, returns `headers`                       |
| `How many records are in data/users.tsv?`               | Calls `read_csv` with `delimiter: "\t"`, reads `rowCount` |
| `Inspect data/orders.csv and summarise the first rows.` | Uses preview text in `text`                               |

## Related

- [read_file](/packages/tools/read-file)
- [read_json](/packages/tools/read-json)
- [Document Ingestion](/packages/tools/document-ingest)
- [Chunking](/glossary#chunk)

## Further reading

- [RFC 4180 (CSV)](https://www.rfc-editor.org/rfc/rfc4180)
