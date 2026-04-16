# Scenario 3 -- Reasoning with multiple steps

::: tip TL;DR
Ask a complex question that requires multiple file reads — verify the agent chains tool calls.
:::

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

← [Back to Scenarios](index.md)
