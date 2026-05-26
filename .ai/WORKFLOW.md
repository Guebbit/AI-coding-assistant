# WORKFLOW — Mandatory Agent Execution Sequence

> Every AI agent MUST follow this workflow for implementation tasks.
> Skipping steps invalidates the output.

---

## Execution Sequence

### 1. ANALYZE

- Read the task/request completely.
- Identify affected files and modules.
- Check `.ai/ARCHITECTURE.md` for boundary constraints.
- Check `.ai/STACK.md` for technology constraints.
- Check `.ai/RULES.md` for behavioral constraints.

### 2. SUMMARIZE UNDERSTANDING

- State what the task requires in your own words.
- List assumptions made.
- List ambiguities or questions.
- If ambiguities exist that could lead to architectural drift: STOP and ask.

### 3. PROPOSE PLAN

- List specific files to create/modify/delete.
- Describe each change at a high level.
- Identify acceptance criteria.
- Identify validation steps.
- If architecture changes are involved: STOP and request approval.

### 4. IMPLEMENT INCREMENTALLY

- Make one logical change at a time.
- Run `npm run build` after each structural change.
- Run `npm run test` after each behavioral change.
- Commit after each coherent unit of work.
- MUST NOT batch large changes into a single step.

### 5. SELF-REVIEW

- Re-read all modified files.
- Verify no unintended side effects.
- Verify no scope drift beyond the task.
- Verify naming conventions match `CONVENTIONS.md`.
- Verify no forbidden patterns from `RULES.md`.

### 6. VALIDATE CHECKLIST

- Run the appropriate checklist from `.ai/CHECKLISTS/`.
- All items MUST pass or have explicit justification for skip.

### 7. FINAL VALIDATION

- Run `npm run build` — MUST pass.
- Run `npm run lint` — MUST pass.
- Run `npm run test` — MUST pass (pre-existing failures excluded).
- Run `npm run prettier:check` — MUST pass.

### 8. SUMMARIZE CHANGES

- List all files modified/created/deleted.
- State what was accomplished.
- State what was intentionally NOT done (if relevant).
- Note any follow-up tasks needed.

---

## Forbidden Execution Patterns

- ❌ Giant rewrites — implement incrementally.
- ❌ Silent architecture changes — MUST request approval.
- ❌ Broad refactors without explicit request — scope MUST match task.
- ❌ Touching unrelated files — ONLY modify what the task requires.
- ❌ Skipping validation — MUST run build/lint/test before completion.
- ❌ Implementing without a plan — MUST propose before coding.
- ❌ Assuming approval — MUST wait for confirmation on architecture changes.

---

## Scope Escalation Protocol

If during implementation you discover:

1. **A bug in adjacent code**: Note it, do NOT fix it unless directly blocking your task.
2. **A needed refactor**: Note it as a follow-up task, do NOT perform it now.
3. **An architecture concern**: STOP, document it, request guidance.
4. **Missing tests in other modules**: Note it, do NOT add them unless in scope.

---

## Task Size Guidelines

| Size    | Characteristics                              | Approach              |
| ------- | -------------------------------------------- | --------------------- |
| Small   | 1-3 files, single concern                   | Implement directly    |
| Medium  | 4-10 files, single feature                  | Plan → implement      |
| Large   | 10+ files, multiple concerns                | Decompose into subtasks|

Large tasks MUST be decomposed into independent subtasks, each following this full workflow.
