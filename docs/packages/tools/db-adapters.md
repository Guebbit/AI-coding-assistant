# Database Adapter Abstraction

::: tip TL;DR
A shared base layer (`base-db-tool.ts`) that all database query tools build on, making it trivial to add support for new engines.
:::

## Overview

Manna's database tools share a common lifecycle:

1. Validate the LLM-provided input (SQL string, NoSQL query, etc.)
2. Open a connection using environment-variable config
3. Execute the read-only operation
4. Close the connection (in a `finally` block — always)
5. Return JSON-serialisable results

`base-db-tool.ts` captures this pattern in a `createDbTool` factory so each engine only implements what makes it unique.

## Architecture

```
ITool  (packages/tools/types.ts)
  └── createDbTool()  (packages/tools/base-db-tool.ts)
        ├── mysqlQueryTool   → mysql_query   (mysql.query.ts)
        ├── pgQueryTool      → pg_query      (pg.query.ts)
        └── mongoQueryTool   → mongo_query   (mongo.query.ts)
```

## Available tools

| Tool | Engine | Operation | Env-var prefix |
|---|---|---|---|
| [`mysql_query`](./mysql-query) | MySQL | `SELECT` | `MYSQL_*` |
| [`pg_query`](./pg-query) | PostgreSQL | `SELECT` | `PG_*` |
| [`mongo_query`](./mongo-query) | MongoDB | `find` / `aggregate` | `MONGO_*` |

## How `createDbTool` works

```typescript
import { createDbTool } from './base-db-tool';

export const myTool = createDbTool({
  name: 'mydb_query',
  description: 'Run read-only queries against MyDB. Input: { query: string }',

  validateInput(raw) {
    // Throw a descriptive Error if input is invalid.
    if (typeof raw.query !== 'string' || !raw.query.trim()) {
      throw new Error('"query" must be a non-empty string');
    }
    return raw as { query: string };
  },

  async run({ query }) {
    const client = await openConnection();
    try {
      return await client.execute(query);
    } finally {
      await client.close(); // always runs, even on error
    }
  },
});
```

The factory returns a fully-formed `ITool` — just pass it to the agent's tool list.

## Adding a new engine

Follow these eight steps:

1. **Install the driver** — `npm install <driver-package>` (and `@types/<driver>` if needed).
2. **Create `packages/tools/<engine>.query.ts`** implementing `createDbTool`:
   - `validateInput` — guard required fields and reject forbidden operations.
   - `run` — open connection → execute → close in `finally`.
3. **Read config from env vars** — use a dedicated prefix (e.g. `ORACLE_*`).
4. **Export** from `packages/tools/index.ts`.
5. **Register conditionally** in `apps/api/agents.ts` — only when env vars are set.
6. **Add a doc page** at `docs/packages/tools/<engine>-query.md`.
7. **Update the sidebar** in `docs/.vitepress/config.mts`.
8. **Update `AI_README.md`** — add the tool name and its env vars.

## Safety principles

All database tools follow the same safety rules:

- **Read-only only** — SQL engines enforce a `SELECT`-only guard before any connection is made; MongoDB only exposes `find` and `aggregate`.
- **Parameterised queries** — raw user data is never interpolated into the query string.
- **Connection cleanup** — connections are always closed in a `finally` block, preventing leaks on error.
- **Conditional registration** — tools whose env vars are not set are simply not loaded, keeping the LLM's tool list clean and relevant.
