# Scenarios: Learn by Doing

Use these as practical drills. Run one scenario at a time and inspect logs.

## How tooling works (general behavior)

Before the scenarios, keep these runtime rules in mind:

1. The agent can only use tools that are registered at API startup.
2. At each step, the model sees a list of available tools in the prompt.
3. If the model asks for a tool that does not exist, the runtime does not crash:
   - it appends an error to context with the list of valid tools
   - it asks the model again on the next loop step
4. If a tool exists but fails (for example, boundary/safety rejection), the error is added to context and the loop continues.
5. If the task cannot be completed with available tools, the run ends with either:
   - a limitation-aware answer (`action: "none"`), or
   - max-step fallback (`Max steps reached without a conclusive answer.`)

Useful events while debugging:
- `agent:step`
- `tool:result`
- `tool:error`
- `agent:max_steps`

## Scenario 1 — File reading

Prompt:

`Read package.json and tell me all npm scripts.`

Expected tool: `read_file`

## Scenario 2 — Shell inspection

Prompt:

`List files in packages and then tell me which modules exist.`

Expected tool: `shell`

## Scenario 3 — Reasoning with multiple steps

Prompt:

`Find where the agent emits completion events and summarize them.`

Expected tools: usually `read_file` (possibly multiple calls)

## Scenario 4 — SQL read-only query

Prompt:

`Run a SELECT query to show 5 rows from table users.`

Expected tool: `mysql_query`

Requires MySQL env vars + reachable DB.

## Scenario 5 — Browser fetch (optional)

Prompt:

`Fetch https://example.com and summarize title + main text.`

Expected tool: `browser_fetch`

Requires Playwright Chromium install and browser tool enabled in API.

## Scenario 5.1 — Vision classification

Prompt:

`Classify the image at data/examples/shark.jpg and describe what it most likely shows.`

Expected tool: `image_classify`

## Scenario 5.2 — Speech transcription

Prompt:

`Transcribe audio file data/examples/meeting.wav`

Expected tool: `speech_to_text`

## Scenario 5.3 — PDF reading

Prompt:

`Read data/examples/spec.pdf and summarize the top 5 key points.`

Expected tool: `read_pdf`

## Scenario 6 — Tool boundary check

Prompt:

`Run rm -rf /tmp`

Expected behavior: rejection by `shell` allowlist.

## Scenario 7 — End-to-end architecture understanding

Prompt:

`Explain the full flow from POST /run to final answer, including events emitted.`

Goal: verify your mental model of the system.

## Scenario 8 — Missing tool behavior

Prompt:

`Search all repository commits and summarize the top 3 contributors.`

Expected behavior:
- if no git-history tool is available, the model may request a non-existent tool first
- runtime returns an in-context correction with available tools
- model should retry with available tools or explain the limitation

## Pro tip for ADHD-friendly learning

Timebox each scenario to 10 minutes:

1. Predict what tool(s) will be used
2. Run the task
3. Compare with actual event logs
4. Note one insight and move on
