# Example: Multi-Agent Swarm

::: tip TL;DR
A complex task gets decomposed into subtasks, executed in parallel by separate agents, reviewed, and synthesized into one answer. This is the `POST /run/swarm` endpoint — Manna's [LangGraph](/glossary#langgraph) orchestrator in action.
:::

## The Request

You want a REST API with authentication and tests. This is too complex for a single agent loop — it's a swarm job.

```bash
curl -X POST http://localhost:3001/run/swarm \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Build a REST API with JWT authentication and unit tests for a user management system",
    "allowWrite": true,
    "profile": "code",
    "maxSubtasks": 4
  }'
```

---

## What Happens Under the Hood

The [swarm orchestrator](/glossary#swarm) is a [LangGraph state machine](/glossary#state-machine) with 4 nodes:

```mermaid
flowchart TD
    START([START]) --> decompose
    decompose["🔀 decompose\nBreak task into subtasks"]
    execute["⚙️ execute_subtasks\nRun each subtask via its own Agent"]
    review{{"🔍 review\nAll passed?"}}
    synthesize["🧩 synthesize\nMerge results into final answer"]
    DONE([END])

    decompose --> execute
    execute --> review
    review -->|"✅ all passed"| synthesize
    review -->|"❌ failures remain\n(retry loop)"| execute
    synthesize --> DONE
```

### Full sequence

```mermaid
sequenceDiagram
    participant Client
    participant API
    participant Orchestrator as Swarm Orchestrator
    participant Agent1 as Agent (subtask 1)
    participant Agent2 as Agent (subtask 2)
    participant Agent3 as Agent (subtask 3)
    participant Events as Event Bus

    Client->>API: POST /run/swarm { task, allowWrite, profile, maxSubtasks }
    API->>Orchestrator: run(task, config)
    Orchestrator->>Events: emit(swarm:start, { task })

    rect rgb(240, 248, 255)
        Note over Orchestrator: Node 1 — DECOMPOSE
        Orchestrator->>Events: emit(swarm:decomposed, { subtasks: [...] })
        Note over Orchestrator: Plan: 3 subtasks identified
    end

    rect rgb(240, 255, 240)
        Note over Orchestrator,Agent3: Node 2 — EXECUTE (parallel)
        Orchestrator->>Events: emit(swarm:subtask_start, { id: "st-1", task: "Design user schema..." })
        Orchestrator->>Agent1: agent.run("Design user schema and CRUD endpoints")
        Orchestrator->>Events: emit(swarm:subtask_start, { id: "st-2", task: "Implement JWT auth..." })
        Orchestrator->>Agent2: agent.run("Implement JWT authentication middleware")
        Orchestrator->>Events: emit(swarm:subtask_start, { id: "st-3", task: "Write unit tests..." })
        Orchestrator->>Agent3: agent.run("Write vitest unit tests for all endpoints")

        Agent1-->>Orchestrator: result (user schema + routes)
        Orchestrator->>Events: emit(swarm:subtask_done, { id: "st-1", success: true })
        Agent2-->>Orchestrator: result (JWT middleware)
        Orchestrator->>Events: emit(swarm:subtask_done, { id: "st-2", success: true })
        Agent3-->>Orchestrator: result (test suite)
        Orchestrator->>Events: emit(swarm:subtask_done, { id: "st-3", success: true })
    end

    rect rgb(240, 248, 255)
        Note over Orchestrator: Node 3 — REVIEW
        Note over Orchestrator: All 3 subtasks passed ✅
    end

    rect rgb(255, 248, 240)
        Note over Orchestrator: Node 4 — SYNTHESIZE
        Note over Orchestrator: Merge 3 results into final answer
        Orchestrator->>Events: emit(swarm:done, { answer: "...", totalDurationMs: 28450 })
    end

    API-->>Client: 200 JSON response
```

### Event log

```json
{ "type": "swarm:start",         "task": "Build a REST API with JWT authentication and unit tests for a user management system" }
{ "type": "swarm:decomposed",    "subtasks": [
    { "id": "st-1", "task": "Design user schema (id, email, passwordHash, createdAt) and CRUD endpoints (GET/POST/PUT/DELETE /users)" },
    { "id": "st-2", "task": "Implement JWT authentication middleware with login endpoint, token generation, and route protection" },
    { "id": "st-3", "task": "Write vitest unit tests for all user CRUD endpoints and the JWT auth flow" }
  ]
}
{ "type": "swarm:subtask_start", "id": "st-1", "task": "Design user schema..." }
{ "type": "swarm:subtask_start", "id": "st-2", "task": "Implement JWT authentication..." }
{ "type": "swarm:subtask_start", "id": "st-3", "task": "Write vitest unit tests..." }
{ "type": "agent:model_routed",  "profile": "code", "model": "qwen2.5-coder:14b-instruct-q8_0" }
{ "type": "agent:step",          "step": 1, "action": "write_file", "thought": "Creating the user model schema..." }
{ "type": "tool:result",         "tool": "write_file", "result": "File written: generated-projects/user-api/src/models/user.ts" }
{ "type": "swarm:subtask_done",  "id": "st-1", "success": true, "durationMs": 8200 }
{ "type": "swarm:subtask_done",  "id": "st-2", "success": true, "durationMs": 9100 }
{ "type": "swarm:subtask_done",  "id": "st-3", "success": true, "durationMs": 11300 }
{ "type": "swarm:done",          "answer": "...", "subtaskCount": 3, "totalDurationMs": 28450 }
```

Notice that each subtask agent emits its own `agent:step` and `tool:result` events. The swarm events (`swarm:*`) wrap the higher-level orchestration flow.

### The decomposition plan

The decompose node produces a structured plan:

```json
{
  "subtasks": [
    {
      "id": "st-1",
      "task": "Design user schema (id, email, passwordHash, createdAt) and CRUD endpoints (GET/POST/PUT/DELETE /users)",
      "dependencies": []
    },
    {
      "id": "st-2",
      "task": "Implement JWT authentication middleware with login endpoint, token generation, and route protection",
      "dependencies": []
    },
    {
      "id": "st-3",
      "task": "Write vitest unit tests for all user CRUD endpoints and the JWT auth flow",
      "dependencies": ["st-1", "st-2"]
    }
  ]
}
```

Subtasks `st-1` and `st-2` have no dependencies, so they run in parallel. Subtask `st-3` depends on both, so it waits. The orchestrator runs them in **topological order**.

---

## The Response

```json
{
  "success": true,
  "status": 200,
  "message": "",
  "data": {
    "result": "## User Management REST API\n\n### Files created:\n\n1. `src/models/user.ts` — User schema with id, email, passwordHash, createdAt fields\n2. `src/routes/users.ts` — CRUD endpoints (GET/POST/PUT/DELETE /users/:id)\n3. `src/middleware/auth.ts` — JWT middleware: verifyToken(), generateToken(), protectRoute()\n4. `src/routes/auth.ts` — POST /login endpoint returning JWT\n5. `tests/users.test.ts` — 8 unit tests covering all CRUD operations\n6. `tests/auth.test.ts` — 5 unit tests covering login, token validation, and protected routes\n\n### Architecture:\n- Express + TypeScript\n- bcrypt for password hashing\n- jsonwebtoken for JWT\n- vitest for testing\n\nAll 13 tests pass.",
    "subtaskResults": [
      { "id": "st-1", "success": true, "durationMs": 8200 },
      { "id": "st-2", "success": true, "durationMs": 9100 },
      { "id": "st-3", "success": true, "durationMs": 11300 }
    ],
    "totalDurationMs": 28450
  },
  "meta": {
    "startedAt": "2026-04-15T17:00:00.000Z",
    "durationMs": 28450
  }
}
```

---

## Key Takeaway

> The swarm orchestrator breaks complex tasks into independent subtasks, runs them in parallel with separate agents, and merges the results. One agent would take 4–5 serial loops; the swarm does it in overlapping parallel work.

---

**Related docs:**
[orchestrator package](/packages/orchestrator) · [Swarm](/glossary#swarm) · [LangGraph](/glossary#langgraph) · [State Machine](/glossary#state-machine) · [Endpoint Map — POST /run/swarm](/endpoint-map)

← [Back to Examples](index.md)
