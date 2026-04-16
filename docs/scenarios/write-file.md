# Scenario 9 -- Write mode: create a file

::: tip TL;DR
Create a file with write mode enabled — verify it lands in the generated-projects folder.
:::

**Goal**: verify write_file creates a file in the generated-projects folder.

> Requires `"allowWrite": true` in request body.

**Request:**

```bash
curl -X POST http://localhost:3001/run \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Create a file called hello.txt in project my-first-app with content: Hello from the agent!",
    "allowWrite": true
  }'
```

**Expected tool**: `write_file`

**Verify:**

```bash
cat data/generated-projects/my-first-app/hello.txt
# Hello from the agent!
```

---

← [Back to Scenarios](index.md)
