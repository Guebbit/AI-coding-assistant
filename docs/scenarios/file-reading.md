# Scenario 1 -- File reading

::: tip TL;DR
Read a file, check the agent parses it and answers from the content.
:::

**Goal**: verify read_file works and the agent can reason about file content.

**Prompt:**

```
Read package.json and tell me all npm scripts.
```

**Expected tool**: `read_file`

**What should happen:**

```
Step 1: read_file  ->  { "path": "package.json" }
        returns: full package.json content
Step 2: action: "none"
        answer: "The npm scripts are: dev, build, typecheck, ..."
```

**What to check in logs:**

- `tool:result` event contains `package.json` text
- Final answer lists scripts from the `"scripts"` key

**Level up**: after this works, try:

```
Read tsconfig.json and tell me what strict mode options are enabled.
```

---

← [Back to Scenarios](index.md)
