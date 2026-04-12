# Tool: `write_file`

## Purpose

Write UTF-8 file content for generated projects.

## Input

```json
{
  "path": "my-app/src/index.ts",
  "content": "console.log(\"hello\")\\n",
  "mode": "create"
}
```

- `path`: relative path under `PROJECT_OUTPUT_ROOT`
- `content`: file content to write
- `mode`:
  - `create` (default): fail if file exists
  - `overwrite`: replace file
  - `append`: append to file

## Output

```json
{
  "path": "data/generated-projects/my-app/src/index.ts",
  "mode": "create",
  "bytesWritten": 22,
  "outputRoot": "data/generated-projects"
}
```

## Safety

- Only writes under `PROJECT_OUTPUT_ROOT` (default `data/generated-projects`)
- Rejects traversal outside allowed root
- Available only when `/run` body includes `"allowWrite": true`
