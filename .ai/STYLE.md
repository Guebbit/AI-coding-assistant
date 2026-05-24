# Coding/style contract

Source of truth for what Manna is and how it is built: [`./README.md`](./README.md).
Linting source of truth: [`../eslint.config.ts`](../eslint.config.ts).
Formatting source of truth: [`../.prettierrc`](../.prettierrc).

Core principles

- Apply SOLID
- Keep modules/functions focused, low nesting
- Prefer pure functions + shared abstractions

Async / error-handling style

- **Prefer promise chaining** (`.then`/`.catch`/`.finally`) over `async/await` when there are only 1–2 awaits in a function.
- Use `async/await` only when multiple sequential awaits make chaining unreadable.
- **Avoid `try/catch`** unless absolutely necessary (e.g. synchronous throws that cannot be expressed as `.catch`, or complex multi-step transactions where partial rollback is needed).

Comments/JSDoc requirements

- Exported function: JSDoc required (`@param`, `@returns`, `@throws` as needed)
- Exported interface/type: JSDoc required (purpose + field meaning)
- File/module: JSDoc `@module` header expected
- Non-trivial internal helpers: concise JSDoc/inline explanation

Shared utility usage

- Path safety helpers: `packages/shared/path-safety.ts`
- Reuse shared helpers; do not duplicate utility logic in tools

Naming conventions (`@typescript-eslint/naming-convention`)

- Interfaces: `IPascalCase`
- Enums: `EPascalCase`
- Enum members: `PascalCase` or `UPPER_CASE`
- Type aliases/classes: `PascalCase`
- Functions/variables/params/properties: `camelCase` (constants may be `UPPER_CASE`)

Documentation diagram rule

- For docs describing flow/architecture/process: include Mermaid diagram (`flowchart`/`sequenceDiagram`/etc.)
- ASCII diagrams can supplement but do not replace Mermaid in pipeline/architecture docs
