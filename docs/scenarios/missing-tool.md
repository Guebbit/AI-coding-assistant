# Scenario 8 -- Missing tool behavior

::: tip TL;DR
Trigger a non-existent tool call — verify the runtime recovers and the agent retries or explains the limitation.
:::

**Goal**: observe what happens when the model tries to use a tool that does not exist.

**Prompt:**

```
Search all repository commits and summarise the top 3 contributors.
```

**Expected behavior:**

1. Model may try a non-existent tool like `git_history` or `search_commits`
2. Runtime appends: "Unknown tool: git_history. Available tools: read_file, shell, ..."
3. Model retries with available tools: tries `shell` -> `git log --oneline`
4. OR model explains the limitation: "I cannot access git history directly..."

**What to look for in logs:**

- `agent:step` with `action: "git_history"` (or similar invented tool)
- `tool:error` or inline error about unknown tool
- `agent:step` with corrected `action`

---

← [Back to Scenarios](index.md)
