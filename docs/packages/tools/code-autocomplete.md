# tools/code_autocomplete

## What

Generates IDE-style code continuation suggestions from prefix/suffix context.

## Input

```json
{
  "prefix": "code before cursor",
  "suffix": "optional code after cursor",
  "language": "optional language hint",
  "model": "optional"
}
```

## Defaults

- model: `TOOL_IDE_MODEL`, then `AGENT_MODEL_CODE`, then `qwen3-coder:14b`

## Notes

- Designed for autocomplete/suggestion style responses, not full-file generation.
