# Checklist: Bug Fix

> Complete ALL items before declaring a bug fix done.

---

## Pre-Implementation

- [ ] Bug behavior clearly described (what happens vs. what should happen)
- [ ] Root cause identified
- [ ] Reproduction steps documented (or test case exists)
- [ ] Fix scope defined (minimal change to resolve the issue)
- [ ] No architecture changes required

---

## Implementation

- [ ] Fix is minimal — addresses root cause only
- [ ] No unrelated changes included
- [ ] No behavior changes beyond the fix
- [ ] Error handling appropriate for the failure mode
- [ ] No `any` types introduced
- [ ] TypeScript strict mode satisfied

---

## Regression Safety

- [ ] Existing tests still pass
- [ ] New test added that reproduces the bug (fails without fix, passes with)
- [ ] Adjacent functionality verified unaffected
- [ ] Edge cases of the fix tested

---

## Validation

- [ ] `npm run build` passes
- [ ] `npm run lint` passes
- [ ] `npm run test` passes
- [ ] `npm run prettier:check` passes
- [ ] Bug no longer reproducible

---

## Final

- [ ] Only files related to the bug are modified
- [ ] No scope drift
- [ ] Commit message references the bug/issue
- [ ] Root cause and fix summarized
