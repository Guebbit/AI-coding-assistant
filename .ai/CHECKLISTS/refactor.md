# Checklist: Refactor

> Complete ALL items before declaring a refactor done.

---

## Pre-Implementation

- [ ] Refactor scope explicitly defined
- [ ] Motivation documented (why this refactor?)
- [ ] Files in scope listed
- [ ] Files explicitly out of scope confirmed
- [ ] No behavioral changes intended (or changes documented)
- [ ] Plan proposed and approved

---

## Implementation

- [ ] Behavior preserved — refactor MUST NOT change functionality
- [ ] All existing tests pass without modification
- [ ] Import directions preserved
- [ ] No new dependencies introduced
- [ ] No circular dependencies created
- [ ] Naming conventions maintained per `CONVENTIONS.md`
- [ ] No `any` types introduced
- [ ] JSDoc preserved or improved on moved/renamed exports

---

## Architecture Safety

- [ ] Module boundaries respected
- [ ] No silent responsibility shifts between packages
- [ ] Dependency flow unchanged
- [ ] Public API surface unchanged (or migration documented)
- [ ] No unrelated modules touched

---

## Regression Safety

- [ ] `npm run build` passes
- [ ] `npm run lint` passes
- [ ] `npm run test` passes (all existing tests)
- [ ] `npm run prettier:check` passes
- [ ] Manual spot-check of affected functionality

---

## Final

- [ ] Scope limited to declared refactor area
- [ ] No feature additions smuggled in
- [ ] No behavioral changes without explicit documentation
- [ ] Commit messages follow Conventional Commits
- [ ] Changes summarized with before/after comparison
