# tools/semantic_search

## What

Performs embedding-based semantic search over provided text snippets and/or file paths.

## Input

```json
{
  "query": "what to search for",
  "documents": ["optional text snippet 1", "optional text snippet 2"],
  "paths": ["optional/file1.md", "optional/file2.ts"],
  "topK": 5
}
```

## Notes

- Uses `OLLAMA_EMBED_MODEL` (default `nomic-embed-text`).
- File path access is restricted to project root boundaries.
- Returns ranked results with cosine similarity scores.
