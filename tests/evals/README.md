# Eval Test Suite

These tests exercise the **full agent and swarm flows end-to-end** using a real Ollama instance.  
They are intentionally excluded from `npm test` (CI) because they are slow and require external services.

## Prerequisites

| Service                     | Default address                            | Notes                                  |
| --------------------------- | ------------------------------------------ | -------------------------------------- |
| **Ollama**                  | `http://localhost:11434`                   | At least one model must be pulled      |
| **Qdrant** _(optional)_     | `http://localhost:6333`                    | Falls back to in-memory if unavailable |
| **PostgreSQL** _(optional)_ | `postgresql://manna:@localhost:5432/manna` | Set `MANNA_DB_ENABLED=false` to skip   |

### Minimum setup

```bash
# Pull a fast model for testing
ollama pull llama3.1:8b-instruct-q8_0

# Start Qdrant (optional — memory-only mode works without it)
podman run -p 6333:6333 qdrant/qdrant
```

## Running evals

```bash
# Run all evals (against localhost Ollama)
npm run test:eval

# Run a single eval file
npx vitest run --config vitest.eval.config.ts tests/evals/agent-loop.eval.ts

# Point at a different Ollama instance
OLLAMA_BASE_URL=http://192.168.1.10:11434 npm run test:eval
```

## Eval files

| File                 | What it tests                                    |
| -------------------- | ------------------------------------------------ |
| `agent-loop.eval.ts` | Full single-agent run: task → tool call → answer |
| `swarm.eval.ts`      | Swarm decompose → execute → synthesise flow      |

## Writing new evals

Each eval file lives under `tests/evals/` and uses the `.eval.ts` extension.
Use `vitest.eval.config.ts` settings (long timeouts, no coverage instrumentation).

```typescript
import { describe, it, expect } from 'vitest';
import { Agent } from '../../packages/agent/agent.js';
import { readFileTool } from '../../packages/tools/fs.read.js';

describe(
    'agent end-to-end',
    () => {
        it('reads a file and answers a question about it', async () => {
            const agent = new Agent([readFileTool]);
            const answer = await agent.run('How many lines does README.md have?');
            expect(answer.length).toBeGreaterThan(0);
        });
    },
    { timeout: 120_000 }
);
```
