# @ai-assistant/memory

Simple short-term memory store for agent context.

## API

- `addMemory(entry)` — append an entry
- `getMemory(n = 10)` — get most recent entries
- `clearMemory()` — reset memory

## Behavior

- In-memory only (non-persistent)
- Capacity capped at 20 entries (oldest evicted first)

## Key file

- `src/memory.ts`
