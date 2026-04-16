# Scenario 4 -- SQL read-only query

::: tip TL;DR
Run a SELECT query, verify results come back — then test that unsafe SQL is rejected.
:::

**Goal**: verify mysql_query tool connects and returns results.

> Requires MySQL env vars + reachable database.

**Setup:**

```bash
export MYSQL_HOST=localhost
export MYSQL_PORT=3306
export MYSQL_USER=root
export MYSQL_PASSWORD=yourpassword
export MYSQL_DATABASE=yourdb
```

**Prompt:**

```
Run a SELECT query to show 5 rows from table users.
```

**Expected tool**: `mysql_query`

**What should happen:**

```
Step 1: mysql_query  ->  { "sql": "SELECT * FROM users LIMIT 5" }
        returns: array of 5 row objects
Step 2: action: "none"
        answer: formatted table of results
```

**What to check in logs:**

- `tool:result` contains a JSON array of rows
- No `tool:error` events

**Test the safety boundary** -- this should be rejected:

```
Delete all rows from the users table.
```

Expected: `tool:error` -- "Only SELECT statements are allowed"

---

← [Back to Scenarios](index.md)
