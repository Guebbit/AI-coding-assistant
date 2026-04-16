# Scenario 5.4 -- Semantic search

::: tip TL;DR
Search by meaning, not keywords — verify results are ranked by semantic similarity.
:::

**Goal**: verify semantic_search ranks files by meaning, not just keywords.

**Prompt:**

```
Search the docs/theory/ files for content most relevant to "how the agent stops running" and rank the results.
```

**Expected tool**: `semantic_search`

**What should happen:**

```
Step 1: semantic_search  ->  {
  "query": "how the agent stops running",
  "paths": ["docs/theory/agent-loop.md", "docs/theory/how-it-works-layered.md", ...],
  "topK": 3
}
returns:
[
  { "text": "Stop conditions: action: none -> done. Max steps >= 5 -> fallback.", "score": 0.93, "source": "docs/theory/agent-loop.md" },
  { "text": "Repeat until done or max 5 steps...", "score": 0.87, "source": "docs/theory/how-it-works-layered.md" },
  { "text": "agent:max_steps -- When step limit is reached", "score": 0.81, "source": "docs/packages/events.md" }
]
```

**Key insight to observe**: the results should include agent-loop.md even though it does not contain the phrase "stops running" -- it contains "max steps", "action: none", "stop conditions" which are semantically similar.

---

← [Back to Scenarios](index.md)
