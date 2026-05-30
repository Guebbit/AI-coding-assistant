# CONVENTIONS — Coding Standards

> Strict coding conventions. Non-negotiable unless explicitly overridden by task scope.
> Linting source of truth: `eslint.config.ts`. Formatting: `.prettierrc`.

---

## TypeScript

- MUST use `strict: true` in all TypeScript code.
- MUST NOT use `any`; use `unknown` with type narrowing.
- MUST use Zod for runtime validation at all boundaries (API, LLM, tools, MCP).
- MUST use ESM imports only (`import`/`export`); no CommonJS.
- MUST export types/interfaces separately from runtime values when possible.

---

## Naming Conventions

| Entity       | Pattern                      | Example                 |
| ------------ | ---------------------------- | ----------------------- |
| Interfaces   | `IPascalCase`                | `IToolResult`           |
| Enums        | `EPascalCase`                | `EOperatingMode`        |
| Enum members | `PascalCase` or `UPPER_CASE` | `LowSpec`, `HIGH_TRUST` |
| Type aliases | `PascalCase`                 | `AgentStepResult`       |
| Classes      | `PascalCase`                 | `PolicyProcessor`       |
| Functions    | `camelCase`                  | `resolveOperatingMode`  |
| Variables    | `camelCase`                  | `maxSteps`              |
| Constants    | `camelCase` or `UPPER_CASE`  | `MAX_ENTRIES`           |
| File names   | `kebab-case.ts`              | `model-router.ts`       |
| Test files   | `*.test.ts`                  | `agent.test.ts`         |

---

## Async / Error Handling

- **Prefer promise chaining** (`.then`/`.catch`/`.finally`) over `async/await` when there are only 1–2 awaits.
- Use `async/await` only when multiple sequential awaits make chaining unreadable.
- **Avoid `try/catch`** unless absolutely necessary (synchronous throws, complex multi-step transactions with partial rollback).
- MUST handle errors explicitly — no swallowed promises.
- MUST use typed errors (`PolicyViolationError`, `PathSafetyError`) over generic `Error`.

---

## Function Design

- MUST apply SOLID principles.
- MUST keep functions focused — single responsibility.
- MUST keep nesting ≤ 3 levels; extract helpers for deeper logic.
- MUST prefer pure functions + shared abstractions.
- MUST NOT exceed ~50 lines per function without justification.
- MUST use early returns to reduce nesting.

---

## Documentation / Comments

- Exported functions: JSDoc REQUIRED (`@param`, `@returns`, `@throws` as needed).
- Exported interfaces/types: JSDoc REQUIRED (purpose + field meaning).
- File/module: JSDoc `@module` header expected.
- Non-trivial internal helpers: concise inline/JSDoc explanation.
- Comments MUST be brief theory-level explanations of what the code does and its role.
- For docs describing flow/architecture/process: include Mermaid diagrams.

---

## File Organization

- One primary export per file (co-locate tightly coupled helpers).
- Group by capability domain, not by file type.
- Test files live in `tests/` mirroring source structure.
- Shared utilities ONLY in `packages/shared/` — reuse, do not duplicate.

---

## Testing

- MUST write unit tests for new logic in `tests/unit/`.
- MUST NOT break existing tests.
- MUST NOT delete existing tests unless fixing a directly related regression.
- Integration tests in `tests/integration/`.
- Eval tests in `tests/evals/` with `vitest.eval.config.ts`.
- Use descriptive `describe`/`it` blocks.
- Test files MUST be named `*.test.ts`.

---

## Error Handling Patterns

- Typed errors: `PolicyViolationError` (from `processors/policy.ts`), `PathSafetyError` (from `shared/path-safety.ts`).
- Fail-open: external deps (Qdrant, Postgres, Neo4j, MCP) MUST log warning and degrade gracefully.
- MUST use Winston logger — never `console.log`.
- MUST include contextual information in error messages.

---

## API Conventions

- MUST use `successResponse`/`rejectResponse` envelope for all endpoints.
- MUST validate request bodies with Zod schemas.
- MUST document new endpoints in `openapi.yaml` before implementation.
- MUST regenerate API client (`npm run genapi`) after `openapi.yaml` changes.
- MUST include `meta` enrichment (`startedAt`, `durationMs`, `requestId`) in responses.
