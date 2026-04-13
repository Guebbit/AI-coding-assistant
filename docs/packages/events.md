# events -- The Notification System

::: tip TL;DR
In-process event bus: components emit events, API subscribes for logging. Loose coupling, zero dependencies.
:::

## What

A synchronous in-process event bus. Components emit named events; subscribers react without being coupled to each other.

> Think of it as a public announcement system inside the app: when something important happens, it announces it, and anyone who is listening can react.

---

## Visual: how events flow

```text
packages/agent/agent.ts             packages/events/bus.ts
        |                                    |
        | emit({ type: "agent:step", ... })  |
        |----------------------------------->|
        |                                    |
        |                                    | notifies all handlers for "agent:step"
        |                                    | notifies all handlers for "*"
        |                                    |
        |                           apps/api/index.ts
        |                                    |
        |                              logger.info(event)
        |                                    |
        |                           your custom handler
        |                                    |
        |                              alerting / metrics
```

---

## API

```typescript
on(type: string, handler: (event) => void): void    // subscribe
off(type: string, handler: (event) => void): void   // unsubscribe
emit(event: AgentEvent): void                       // publish
```

Use `"*"` to subscribe to **all** event types at once.

---

## All event types

| Event | When it fires | Key payload fields |
|---|---|---|
| `agent:start` | Before the first loop step | `task` |
| `agent:step` | After each model decision | `step`, `thought`, `action`, `input` |
| `agent:model_routed` | After router picks a profile | `profile`, `model` |
| `tool:result` | After a tool runs successfully | `tool`, `result` |
| `tool:error` | After a tool throws | `tool`, `error` |
| `agent:done` | When `action:"none"` reached | `answer` |
| `agent:max_steps` | When step limit hit | `steps` |
| `agent:error` | Unrecoverable failure | `error` |

---

## Real-life uses

### 1 -- Log everything (what the API does by default)

```typescript
events.on("*", (event) => {
  logger.info(event.type, event);
});
```

Every event gets logged. You can see the full lifecycle of any run in your logs.

---

### 2 -- Debug a specific tool failure

```typescript
events.on("tool:error", (event) => {
  console.error(`Tool ${event.tool} failed:`, event.error);
});
```

Fires only when a tool throws. Useful for targeted debugging.

---

### 3 -- Track performance per model profile

```typescript
const stepTimes: Record<string, number[]> = {};

events.on("agent:model_routed", (event) => {
  stepTimes[event.profile] = stepTimes[event.profile] || [];
  stepTimes[event.profile].push(Date.now());
});
```

---

### 4 -- Alert when the agent hits the step limit

```typescript
events.on("agent:max_steps", (event) => {
  sendAlert(`Agent hit max steps (${event.steps}) without completing task.`);
});
```

---

### 5 -- Build a UI progress stream

You could add a WebSocket and push events to a browser UI in real time:

```typescript
events.on("*", (event) => {
  wsClients.forEach(client => client.send(JSON.stringify(event)));
});
```

---

## Notes

- Handler failures are isolated and logged -- one bad handler does not break the loop
- **No persistence**: memory-only, process-local
- If the process restarts, all event history is gone
- For production: replace with a durable async event bus (message queue, log sink, etc.)

---

## Where in code

- `packages/events/bus.ts`

```mermaid
flowchart LR
    Agent -->|emit| Bus[Event Bus]
    Tools -->|emit| Bus
    Bus -->|notify| Logger["API Logger"]
    Bus -->|notify| Custom["Your Handler"]
    Bus -->|notify| Metrics["Metrics / Alerts"]
```
