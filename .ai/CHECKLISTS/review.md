# Checklist: Code Review

> Use when reviewing changes (own or others').

---

## Correctness

- [ ] Logic is correct for all paths (happy + error + edge cases)
- [ ] No off-by-one errors
- [ ] No unhandled promise rejections
- [ ] No race conditions in async code
- [ ] Error types are specific (not generic `Error`)
- [ ] Return types match Zod schemas at boundaries

---

## Architecture Compliance

- [ ] Import directions correct (`apps/` → `packages/` → `shared/`)
- [ ] No circular dependencies
- [ ] No imports from `apps/` in `packages/`
- [ ] Module boundaries respected
- [ ] No new responsibilities added to `shared/`
- [ ] Existing patterns followed (not reinvented)

---

## Style & Conventions

- [ ] Naming matches `CONVENTIONS.md`
- [ ] No `any` types
- [ ] No `console.log`
- [ ] JSDoc on all new exports
- [ ] Promise chaining used appropriately
- [ ] Functions focused and ≤ ~50 lines
- [ ] Nesting ≤ 3 levels

---

## Security

- [ ] No hardcoded secrets or credentials
- [ ] Path operations use `resolveSafePath`/`resolveInsideRoot`
- [ ] Write operations gated by `allowWrite`
- [ ] SQL queries are parameterized
- [ ] User input validated with Zod before use

---

## Testing

- [ ] New logic has test coverage
- [ ] No existing tests broken
- [ ] Edge cases tested
- [ ] Error paths tested

---

## Scope

- [ ] Changes are within declared task scope
- [ ] No unrelated modifications
- [ ] No silent architecture changes
- [ ] No feature additions beyond requirements
