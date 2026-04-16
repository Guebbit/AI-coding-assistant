# Packages Overview

::: tip TL;DR
5 packages: agent (loop), llm (Ollama), memory (Qdrant + buffer), events (pub/sub), tools (actions). API wires them together.
:::

The API app wires small focused packages. Each package has a single responsibility.

---

## Fast mental map

```mermaid
flowchart TD
    POST["POST /run\n{ task: '...' }"] --> API["apps/api"]
    API -->|creates and wires| Agent["agent\n(loop)"]
    API -->|creates and wires| Memory["memory\n(context)"]
    API -->|creates and wires| Events["events\n(logs)"]
    Agent -->|asks what to do| LLM["llm\n(Ollama)"]
    Agent -->|runs| Tools["tools\n(actions)"]
```

---

## Package descriptions

### `agent` -- The Brain

Makes decisions in a loop. For each step: builds a prompt, routes to a model, asks LLM, runs the chosen tool, repeats.

**Role**: orchestration  
**Key method**: `agent.run(task) -> Promise<string>`  
[Full docs ->](/packages/agent)

---

### `orchestrator` -- LangGraph Swarm

Coordinates multiple `Agent` instances to solve a complex task via a LangGraph state machine.
Supports cyclic review→retry workflows. Replaces the legacy `SwarmOrchestrator`.

**Role**: multi-agent swarm orchestration  
**Key method**: `orchestrator.run(task, config) -> Promise<ISwarmResult>`  
[Full docs ->](/packages/orchestrator)

---

### `llm` -- Model Connection

Thin HTTP wrapper around Ollama. Sends prompts, gets text responses.

**Role**: model I/O  
**Key method**: `llm.generate(prompt, options) -> Promise<string>`  
[Full docs ->](/packages/llm)

---

### `memory` -- Short-term Storage

Hybrid memory: local ring buffer (20 entries) + Qdrant semantic vector search.

**Role**: context continuity across runs  
**Key methods**: `addMemory(entry)`, `getMemory(query, n)`  
[Full docs ->](/packages/memory)

---

### `mcp` -- External Tool Bridge

Discovers MCP server tools at startup and wraps them as native Manna tools.

**Role**: external tool integration via MCP  
**Key method**: `loadMCPTools(configPath?) -> { readTools, writeTools, meta }`  
[Full docs ->](/packages/mcp)

---

### `events` -- Notification System

In-process pub/sub bus. Components emit events; API subscribes for logging.

**Role**: observability and loose coupling  
**Key methods**: `on(type, handler)`, `emit(event)`, `off(type, handler)`  
[Full docs ->](/packages/events)

---

### `tools` -- The Toolbox

All the actions the agent can take. Each tool is `{ name, description, execute(input) }`.

**Role**: real-world execution (files, shell, DB, browser, etc.)  
[Full docs ->](/packages/tools/)

---

## How they interact (sequence for one run)

```mermaid
sequenceDiagram
    participant Client
    participant API as apps/api
    participant Agent
    participant Memory
    participant Router
    participant LLM
    participant Tools
    participant Events

    Client->>API: POST /run { task }
    API->>Agent: create(llm, memory, tools, events)
    API->>Events: on("*", logger.info)
    API->>Agent: agent.run(task)
    Agent->>Events: emit(agent:start)

    loop Each step (max 5)
        Agent->>Memory: getMemory(task)
        Memory-->>Agent: context
        Agent->>Agent: buildPrompt(task, context, tools)
        Agent->>Router: route(task)
        Router-->>Agent: profile
        Agent->>LLM: generate(prompt, { model })
        LLM-->>Agent: { action, input }
        Agent->>Tools: tools[action].execute(input)
        Tools-->>Agent: result
        Agent->>Events: emit(tool:result)
        Agent->>Agent: context.append(result)
    end

    Agent->>Memory: addMemory({ task, result })
    Agent->>Events: emit(agent:done)
    API-->>Client: finalAnswer
```

---

## Package pages

- [agent -- The Brain](/packages/agent)
- [orchestrator -- LangGraph Swarm](/packages/orchestrator)
- [llm -- Model Connection](/packages/llm)
- [memory -- Short-term Storage](/packages/memory)
- [mcp -- MCP Bridge](/packages/mcp)
- [events -- Notifications](/packages/events)
- [tools -- Toolbox](/packages/tools/)

```mermaid
flowchart TD
    API[apps/api] -->|creates| Agent
    Agent -->|asks| LLM[llm / Ollama]
    Agent -->|runs| Tools
    Agent -->|reads/writes| Memory
    Agent -->|emits| Events
    LLM -->|JSON decision| Agent
    Tools -->|result| Agent
    Memory -->|past context| Agent
```
