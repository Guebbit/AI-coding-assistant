# Scenario 2 -- Shell inspection

::: tip TL;DR
Run a shell command, check the agent reads the output and explains it.
:::

**Goal**: verify shell tool runs commands and the agent interprets output.

**Prompt:**

```
List files in packages and then tell me which modules exist.
```

**Expected tool**: `shell`

**What should happen:**

```
Step 1: shell  ->  { "command": "ls packages" }
        returns: agent  events  llm  memory  tools
Step 2: action: "none"
        answer: "The modules are: agent, events, llm, memory, tools"
```

**What to check in logs:**

- `agent:step` shows `action: "shell"`
- `tool:result` shows the directory listing

**Level up**: try:

```
Show me the last 5 git commits with their messages.
```

(Expected: `shell` -> `git log --oneline -5`)

---

← [Back to Scenarios](index.md)
