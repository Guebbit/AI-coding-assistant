# Scenario 10 -- Write mode: scaffold a project

::: tip TL;DR
Scaffold from a template — verify the boilerplate is copied to generated-projects.
:::

**Goal**: verify scaffold_project copies a template to generated-projects.

> Requires a boilerplate at `data/boilerplates/react-ts/` and `"allowWrite": true`.

**Request:**

```bash
curl -X POST http://localhost:3001/run \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Scaffold a new project from template react-ts called my-react-app",
    "allowWrite": true
  }'
```

**Expected tool**: `scaffold_project`

**Verify:**

```bash
ls data/generated-projects/my-react-app/
# Should mirror the react-ts boilerplate structure
```

---

← [Back to Scenarios](index.md)
