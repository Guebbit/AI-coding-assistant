# RULES — Global Behavioral Constraints

> Every AI agent MUST comply with these rules in every session.
> Violations invalidate the entire output.

---

## Scope Constraints

- MUST read `.ai/ARCHITECTURE.md` and `.ai/STACK.md` before any implementation.
- MUST NOT modify files outside the declared scope of the current task.
- MUST NOT touch unrelated modules, tests, or configurations.
- MUST limit changes to the minimum required to satisfy acceptance criteria.
- MUST preserve existing architecture unless the task explicitly requests architecture changes.
- MUST NOT introduce new dependencies without explicit approval.
- MUST NOT remove or rename existing exports without explicit approval.

---

## Editing Rules

- MUST NOT perform large rewrites; implement incrementally.
- MUST NOT refactor code that is not directly related to the current task.
- MUST NOT silently change architectural boundaries, folder structure, or module responsibilities.
- MUST NOT move files between capability domains without explicit instruction.
- MUST NOT change public API signatures unless the task requires it.
- MUST NOT delete or modify existing tests unless fixing a directly related regression.
- MUST preserve all existing behavior unless removal is explicitly requested.

---

## Architecture Preservation

- MUST maintain the capability-oriented modular monolith structure.
- MUST NOT introduce microservice patterns, message queues, or service splits.
- MUST respect dependency flow: `apps/api/` → `packages/*` → `packages/shared/`.
- MUST NOT create circular dependencies between packages.
- MUST NOT import from `apps/` inside `packages/`.
- MUST keep `packages/shared/` limited to truly generic, cross-cutting utilities.

---

## Output & Formatting

- MUST use TypeScript strict mode (`strict: true`).
- MUST validate all LLM-facing schemas with Zod.
- MUST use the existing response envelope (`successResponse`/`rejectResponse`).
- MUST follow Conventional Commits for commit messages.
- MUST pass `npm run build` (tsc --noEmit) before considering work complete.
- MUST pass `npm run lint` before considering work complete.

---

## Anti-Hallucination Rules

- MUST NOT assume model names — read `.env.example` and current env.
- MUST NOT invent API endpoints — check `openapi.yaml`.
- MUST NOT fabricate tool names — check `packages/tools/` and `apps/api/agents.ts`.
- MUST NOT assume env var names — check `.env.example` and `shared/validateRequiredEnvironment()`.
- MUST NOT reference packages or libraries not in `package.json`.
- MUST verify file existence before referencing or importing.
- MUST NOT guess database schemas — check `packages/persistence/migrations/`.

---

## Forbidden Behaviors

- NEVER generate placeholder or stub implementations without marking them `// TODO:`.
- NEVER add `any` types; use `unknown` with type narrowing if type is uncertain.
- NEVER use `console.log` — use the Winston logger (`packages/logger/logger.ts`).
- NEVER hardcode secrets, URLs, ports, or model names.
- NEVER bypass the PolicyProcessor or path-safety checks.
- NEVER register write tools without `allowWrite: true` gating.
- NEVER disable ESLint rules inline without a justifying comment.
- NEVER commit `.env` files or secrets.

---

## Planning Requirements

- MUST summarize understanding of the task before implementation.
- MUST propose a plan with explicit file-change list before coding.
- MUST define acceptance criteria before implementation begins.
- MUST request approval if the plan involves architecture changes.
- MUST implement in small, testable increments.
- MUST self-review changes against acceptance criteria before declaring completion.
