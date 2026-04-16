# Coding/style contract

Core principles

- Apply SOLID
- Keep modules/functions focused, low nesting
- Prefer pure functions + shared abstractions

Comments/JSDoc requirements

- Exported function: JSDoc required (`@param`, `@returns`, `@throws` as needed)
- Exported interface/type: JSDoc required (purpose + field meaning)
- File/module: JSDoc `@module` header expected
- Non-trivial internal helpers: concise JSDoc/inline explanation

Shared utility usage

- Env parsing helpers: `packages/shared/env.ts`
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
