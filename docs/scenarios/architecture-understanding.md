# Scenario 7 -- End-to-end architecture understanding

::: tip TL;DR
Ask the agent to explain its own architecture — verify it reads source code and synthesises a correct answer.
:::

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

← [Back to Scenarios](index.md)
