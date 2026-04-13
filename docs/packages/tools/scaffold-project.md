# Tool: `scaffold_project`

::: tip TL;DR
Copies a boilerplate template into generated-projects. Requires `allowWrite: true`.
:::

## Purpose

Create a new project by copying one boilerplate template.

## What it does in plain English

> "Copy this template folder into a new project folder and give me the metadata about it."

Instead of generating files from scratch, you pre-build **boilerplates** (template folders) and this tool copies one into your generated-projects area. Think of it like `create-react-app` but for your own custom templates.

## ⚠️ Write mode is opt-in

Like `write_file`, this tool only becomes available when the request includes `"allowWrite": true`.

## Input

```json
{
  "template": "react-ts",
  "projectName": "my-react-app",
  "overwrite": false,
  "metadataFile": "template.json"
}
```

| Field | Required | Default | Notes |
|---|---|---|---|
| `template` | ✅ | — | Name of the template folder inside `BOILERPLATE_ROOT` |
| `projectName` | ✅ | — | Target folder name inside `PROJECT_OUTPUT_ROOT` |
| `overwrite` | ❌ | `false` | If `true`, replaces an existing project with the same name |
| `metadataFile` | ❌ | `"template.json"` | Optional metadata file to read from the template folder |

## Output

```json
{
  "template": "react-ts",
  "projectPath": "data/generated-projects/my-react-app",
  "outputRoot": "data/generated-projects",
  "boilerplateRoot": "data/boilerplates",
  "metadata": {
    "stack": "react",
    "language": "typescript",
    "packageManager": "npm",
    "testCommand": "npm test"
  }
}
```

If `metadataFile` exists in the template folder, it is parsed as JSON (or returned as raw text if not valid JSON).

## Safety

- Reads only from `BOILERPLATE_ROOT` (default `data/boilerplates`)
- Writes only into `PROJECT_OUTPUT_ROOT` (default `data/generated-projects`)
- Rejects any traversal attempt in either direction
- Available only when `/run` body includes `"allowWrite": true`

## Environment variables

| Variable | Default |
|---|---|
| `BOILERPLATE_ROOT` | `data/boilerplates` |
| `PROJECT_OUTPUT_ROOT` | `data/generated-projects` |

## How the folder structure works

```text
data/
  boilerplates/           <-- your templates (BOILERPLATE_ROOT)
    react-ts/
      src/
        App.tsx
        index.tsx
      package.json
      tsconfig.json
      template.json       <-- optional metadata
    express-api/
      src/
        index.ts
      package.json
      template.json

  generated-projects/     <-- output (PROJECT_OUTPUT_ROOT)
    my-react-app/         <-- scaffold_project copies react-ts here
      src/
        App.tsx
        ...
```

## How the agent uses it (step-by-step)

```text
You ask:  "Scaffold a new project from template react-ts called my-widget"
  (with allowWrite: true)
             |
Agent calls:  scaffold_project  ->  {
  "template": "react-ts",
  "projectName": "my-widget"
}
             |
Tool checks:  data/boilerplates/react-ts  exists? -> yes
Tool checks:  data/generated-projects/my-widget  exists? -> no (safe to create)
             |
Tool copies entire react-ts/ tree  ->  data/generated-projects/my-widget/
Tool reads:   data/boilerplates/react-ts/template.json
             |
Returns:  { projectPath: "data/generated-projects/my-widget", metadata: {...} }
             |
Agent: "Project my-widget created from react-ts template."
```

## Setting up your first boilerplate

1. Create the boilerplate directory:
   ```bash
   mkdir -p data/boilerplates/express-api/src
   ```
2. Add your template files:
   ```bash
   # Add src/index.ts, package.json, tsconfig.json ...
   ```
3. Add optional metadata:
   ```json
   // data/boilerplates/express-api/template.json
   {
     "stack": "express",
     "language": "typescript",
     "packageManager": "npm",
     "testCommand": "npm test",
     "description": "Minimal Express + TypeScript API"
   }
   ```
4. Now you can scaffold from it:
   ```bash
   curl -X POST http://localhost:3001/run \
     -H "Content-Type: application/json" \
     -d '{"task":"Scaffold project my-api from template express-api","allowWrite":true}'
   ```

## Real-life use cases

### Use case 1 -- Scaffold a frontend project

**Prompt (with allowWrite: true):**
```
Scaffold a new project from template react-ts called my-dashboard and tell me what files it includes.
```

**What happens:**
1. `scaffold_project` copies `data/boilerplates/react-ts/` → `data/generated-projects/my-dashboard/`
2. Reads `template.json` for metadata
3. Agent lists the files and describes the project structure

---

### Use case 2 -- Scaffold + customise in one run

**Prompt (with allowWrite: true):**
```
Scaffold project my-api from template express-api, then create a README.md describing it as a user authentication service.
```

**Steps:**
```
Step 1: scaffold_project  ->  { "template": "express-api", "projectName": "my-api" }
Step 2: write_file        ->  { "path": "my-api/README.md", "content": "..." }
Step 3: action: "none"    ->  Done
```

---

### Use case 3 -- Scaffold multiple projects from one template

**Prompt (with allowWrite: true):**
```
Create 3 microservices from the express-api template: user-service, order-service, payment-service.
```

Agent calls `scaffold_project` three times, once per service name.

---

## Good test prompts

| What you type (with allowWrite: true) | What the agent does |
|---|---|
| `Scaffold project my-react-app from template react-ts` | Copies template, returns metadata |
| `What templates are available in data/boilerplates?` | Agent uses `shell` → `ls data/boilerplates` |
| `Scaffold my-app and create a custom index.ts in it.` | scaffold_project then write_file |
