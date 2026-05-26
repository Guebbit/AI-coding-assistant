# Manna — AI Operating System

> **MANDATORY for every AI session.** Read this index, then load relevant files before any task.
> This folder is the **single source of truth** for AI agent behavior.
> If anything in the codebase conflicts with `.ai/` files, fix the conflicting source.

---

## Load Order

1. **Always read first**: `RULES.md` — behavioral constraints (never skip)
2. **Before implementation**: `STACK.md` + `ARCHITECTURE.md` + `CONVENTIONS.md`
3. **During execution**: `WORKFLOW.md` — mandatory step sequence
4. **Before completion**: `CHECKLISTS/` — validation gates

---

## File Map

```
.ai/
├── README.md           ← This index (start here)
├── RULES.md            ← Global behavioral constraints (MUST/MUST NOT)
├── STACK.md            ← Canonical tech stack, tooling, model routing
├── ARCHITECTURE.md     ← System structure, boundaries, dependency flow
├── CONVENTIONS.md      ← Coding standards, naming, error handling, testing
├── WORKFLOW.md         ← Mandatory execution sequence for all tasks
├── CHECKLISTS/
│   ├── feature.md      ← Feature implementation gate
│   ├── refactor.md     ← Refactor safety gate
│   ├── bugfix.md       ← Bug fix gate
│   └── review.md       ← Code review gate
├── TASKS/
│   └── TEMPLATE.md     ← Task definition template (copy per task)
├── PROMPTS/
│   └── README.md       ← Reusable prompt fragments
├── EXAMPLES/
│   └── README.md       ← Reference implementation patterns
└── ADR/
    └── README.md       ← Architecture Decision Records
```

---

## Quick Reference

| Need to know...          | Read                  |
| ------------------------ | --------------------- |
| What I MUST NOT do       | `RULES.md`            |
| What tech to use         | `STACK.md`            |
| How the system is built  | `ARCHITECTURE.md`     |
| How to write code        | `CONVENTIONS.md`      |
| How to execute a task    | `WORKFLOW.md`         |
| How to validate work     | `CHECKLISTS/`         |
| How to define a task     | `TASKS/TEMPLATE.md`   |

---

## Core Principles

1. Minimize repeated prompting
2. Keep agents focused on narrow scopes
3. Reduce unrelated rewrites
4. Reduce architectural drift
5. Encourage incremental execution
6. Enforce explicit planning before coding
7. Enforce explicit acceptance criteria
8. Preserve existing architecture unless requested
9. Optimize for deterministic outputs
10. Work across multiple AI coding tools

---

## Identity (Quick)

| Field     | Value                                                    |
| --------- | -------------------------------------------------------- |
| Name      | Manna                                                    |
| Type      | Personal AI Agent Platform — local-first, extensible     |
| Package   | `@guebbit/manna` (private, alpha)                        |
| Runtime   | Node.js ≥ 18, pure ESM, TypeScript 5.8 strict           |
| Entry     | `apps/api/index.ts` (Express, `PORT=3001`)               |
| Core API  | `POST /run` (agent loop)                                 |
| Contract  | `openapi.yaml` (Spectral-linted)                         |
| Validate  | `npm run complete:check`                                 |

---

## Cross-Tool Compatibility

This system works with:
- GitHub Copilot (agent mode)
- Cursor
- Claude Code
- Continue
- Aider

All files use plain Markdown with imperative language optimized for machine parsing.
