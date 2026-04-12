# events — The Notification System

## What

A synchronous in-process event bus.

## Role

"Something happened" notifications for observability and logging.

## API

- `on(type, handler)` subscribe
- `off(type, handler)` unsubscribe
- `emit(event)` publish

Use `"*"` to subscribe to all event types.

## Typical events

- `agent:start`
- `agent:step`
- `agent:model_routed`
- `tool:result`
- `tool:error`
- `agent:done`
- `agent:error`
- `agent:max_steps`

## Notes

- Handler failures are isolated and logged
- No persistence (memory-only, process-local)

## Where in code

- `packages/events/bus.ts`
