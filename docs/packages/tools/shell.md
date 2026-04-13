# Tool: `shell`

::: tip TL;DR
Runs allowlisted shell commands (ls, git, npm, node, etc). Everything else is rejected.
:::

## Purpose

Run a shell command when direct command execution is needed.

## What it does in plain English

> "Run this terminal command for me and give me back the output."

The agent uses this when reading a file is not enough — it needs to actually **execute** something on the system, like listing directories, running git, or checking system state.

## Input

```json
{ "command": "ls -la", "timeout": 10000 }
```

`timeout` is optional (milliseconds), default 10 seconds.

## Output

```json
{ "stdout": "...", "stderr": "..." }
```

## Allowed base commands

```
cat   date   df   du   echo   find   git   grep
ls    node   npm   ps   pwd   uname
```

> ⚠️ **Security**: the tool checks that the command starts with one of these exact words. Anything else — including `rm`, `curl`, `bash`, `chmod` — is **immediately rejected**.

## How the tool parses the command

The tool splits the command on spaces and checks the **first word** only.

```
"ls -la packages"   → first word = "ls"   → ✅ allowed
"git log --oneline" → first word = "git"  → ✅ allowed
"rm -rf /tmp"       → first word = "rm"   → ❌ rejected
"curl http://..."   → first word = "curl" → ❌ rejected
```

## How the agent uses it (step-by-step)

```text
You ask:  "What modules exist under packages/?"
             ↓
Agent thinks: "I should list the directory"
             ↓
Agent calls:  shell  →  { "command": "ls -la packages" }
             ↓
Tool runs `ls -la packages` in the process working directory
             ↓
stdout comes back: agent/  events/  llm/  memory/  tools/
             ↓
Agent lists the modules for you
```

## Real-life use cases

### Use case 1 — Checking project status

**Prompt:**
```
What branch am I on and are there any uncommitted changes?
```

**What happens inside:**
1. Agent calls `shell` → `{ "command": "git status" }`
2. stdout shows the current branch and file status
3. Agent translates it to plain English for you

---

### Use case 2 — Finding a file across the whole project

**Prompt:**
```
Find all TypeScript files that import from packages/events.
```

**What happens inside:**
```
shell  →  { "command": "grep -r \"from 'packages/events'\" --include=\"*.ts\" ." }
```

Returns every matching file path and line number.

---

### Use case 3 — Checking running processes

**Prompt:**
```
Is the Ollama process running?
```

**What happens inside:**
```
shell  →  { "command": "ps aux" }
```

Agent scans stdout for a line containing `ollama` and tells you yes/no.

---

### Use case 4 — Recent git history

**Prompt:**
```
Show me the last 5 commits with their messages.
```

**What happens inside:**
```
shell  →  { "command": "git log --oneline -5" }
```

Returns 5 short commit lines, which the agent can describe or filter.

---

## Good test prompts

| What you type | Command the agent will try |
|---|---|
| `Run pwd and tell me current directory.` | `pwd` |
| `List files in packages with ls.` | `ls packages` |
| `How much disk space is free?` | `df -h` |
| `What node version is installed?` | `node --version` |
| `Show me the last 10 commits.` | `git log --oneline -10` |
| `Run rm -rf /tmp` | ❌ **Rejected** — `rm` is not in allowlist |
