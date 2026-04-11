# @ai-assistant/events

Minimal synchronous in-process event bus.

## API

- `on(type, handler)` — subscribe to a specific event type
- `off(type, handler)` — unsubscribe
- `emit(event)` — publish event to matching handlers

Use `"*"` as event type to receive all events.

## Notes

- Handler errors are isolated (caught/logged) so one bad subscriber does not block others.
- This is in-memory and process-local (not durable).

## Key file

- `src/bus.ts`
