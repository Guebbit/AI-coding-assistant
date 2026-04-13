# Tool: `semantic_search`

::: tip TL;DR
Ranks text/files by meaning using Ollama embeddings. Finds relevant content even with different wording.
:::

## What it does in plain English

> "Find the most relevant pieces of text from this list, ranked by meaning — not just keyword matching."

This is **not** a `grep`. It understands meaning. You search by concept and it returns the closest matches even if they use different words.

## Input

```json
{
  "query": "what to search for",
  "documents": ["optional text snippet 1", "optional text snippet 2"],
  "paths": ["optional/file1.md", "optional/file2.ts"],
  "topK": 5
}
```

| Field | Required | Notes |
|---|---|---|
| `query` | ✅ | What you are looking for (in plain English) |
| `documents` | ❌ | Inline text snippets to rank |
| `paths` | ❌ | File paths to read and rank — file contents are loaded automatically |
| `topK` | ❌ | How many top results to return (default: all, sorted) |

You must provide at least one of `documents` or `paths`.

## Output

A ranked list of results with similarity scores:

```json
[
  { "text": "The agent loop runs up to 5 steps...", "score": 0.94, "source": "packages/agent/agent.ts" },
  { "text": "Max steps reached without a conclusive answer.", "score": 0.81, "source": "packages/agent/agent.ts" }
]
```

## How it works internally

```text
Your query: "how does the agent stop?"
    ↓
Tool embeds query using Ollama (OLLAMA_EMBED_MODEL = nomic-embed-text)
    ↓
Each document/file is also embedded
    ↓
Cosine similarity is computed: query vector vs each document vector
    ↓
Results are sorted by score (highest = most relevant)
    ↓
Top K results returned to agent
```

## Why this beats keyword search

```
Keyword search for "loop termination":
  → finds files containing the exact words "loop" AND "termination"
  → misses: "max steps reached", "action: none", "stop conditions"

Semantic search for "how does the agent stop":
  → finds: "action: none means done", "max steps fallback", "stop conditions"
  → even though none of those contain the word "termination"
```

## Environment variable

- `OLLAMA_EMBED_MODEL` (default `nomic-embed-text`) — the embedding model used

## Real-life use cases

### Use case 1 — Find relevant documentation sections

**Prompt:**
```
Search docs/theory/ for content related to "how memory affects agent decisions" and rank the results.
```

**Agent builds:**
```json
{
  "query": "how memory affects agent decisions",
  "paths": [
    "docs/theory/agent-loop.md",
    "docs/theory/prompt-context-memory.md",
    "docs/theory/how-it-works-layered.md"
  ],
  "topK": 3
}
```

Returns the 3 most semantically relevant passages.

---

### Use case 2 — Find where a concept is implemented in code

**Prompt:**
```
Which TypeScript files deal with "error recovery and retry logic"?
```

Agent collects all `.ts` files and runs semantic search to find the most relevant ones — without needing to know the exact function names.

---

### Use case 3 — Rank inline text snippets

You have 5 candidate error messages and want the one most relevant to a user complaint.

**Agent builds:**
```json
{
  "query": "database connection failed",
  "documents": [
    "Failed to reach MySQL host",
    "Model response timeout",
    "File not found in project root",
    "Unable to connect to database server",
    "Shell command rejected by allowlist"
  ],
  "topK": 2
}
```

Returns: `"Unable to connect to database server"` and `"Failed to reach MySQL host"` as top matches.

---

## Good test prompts

| What you type | What the agent does |
|---|---|
| `Search packages/agent/ for code related to "step limit and fallback".` | Embeds `.ts` files, ranks by similarity |
| `Which doc page best explains how memory works?` | Embeds docs, semantic rank |
| `Find the most relevant section in README.md for "write mode tools".` | Embeds sections, ranks |
