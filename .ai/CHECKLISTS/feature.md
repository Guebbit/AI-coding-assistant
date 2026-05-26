# Checklist: Feature Implementation

> Complete ALL items before declaring a feature done.

---

## Pre-Implementation

- [ ] Task requirements clearly understood
- [ ] Acceptance criteria defined
- [ ] Files in scope identified
- [ ] Files out of scope confirmed
- [ ] No architecture changes required (or approval obtained)
- [ ] Plan proposed and reviewed

---

## Implementation

- [ ] TypeScript strict mode — no `any` types
- [ ] Zod schemas for all boundaries (API input, LLM output, tool params)
- [ ] Error handling uses typed errors (not generic `Error`)
- [ ] Promise chaining preferred over async/await where appropriate
- [ ] Functions ≤ 50 lines, nesting ≤ 3 levels
- [ ] No hardcoded values — use env vars or config
- [ ] Logging via Winston (no `console.log`)
- [ ] JSDoc on all exported functions/types/interfaces

---

## Architecture Safety

- [ ] No new circular dependencies introduced
- [ ] Import direction respected: `apps/` → `packages/` → `shared/`
- [ ] No imports from `apps/` inside `packages/`
- [ ] `shared/` contains only generic utilities
- [ ] Existing module boundaries preserved
- [ ] Response envelope used (`successResponse`/`rejectResponse`)

---

## Testing

- [ ] Unit tests written for new logic
- [ ] Existing tests still pass (`npm run test`)
- [ ] No existing tests deleted or modified (unless fixing related regression)
- [ ] Edge cases considered and tested

---

## Validation

- [ ] `npm run build` passes
- [ ] `npm run lint` passes
- [ ] `npm run test` passes
- [ ] `npm run prettier:check` passes
- [ ] OpenAPI spec updated if new/changed endpoints (`openapi.yaml`)
- [ ] API client regenerated if spec changed (`npm run genapi`)

---

## Documentation

- [ ] JSDoc complete on new exports
- [ ] `openapi.yaml` updated for new endpoints
- [ ] `.ai/` files updated if architecture/stack changed
- [ ] Relevant `docs/` updated if user-facing behavior changed

---

## Final

- [ ] No unrelated files modified
- [ ] No scope drift beyond task requirements
- [ ] Commit messages follow Conventional Commits
- [ ] Changes summarized
