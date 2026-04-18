# Manna AI context index

MANDATORY: read this file first every session.

## Purpose of `.ai/*`

`.ai/*` is **AI-only navigation context**. It is intentionally brief.

The canonical, user-facing source of truth is the VitePress documentation in `docs/`.

## Fast orientation

- Repo: `Guebbit/manna`
- Stack: TypeScript + Node.js (ESM)
- API entrypoint: `apps/api/index.ts`
- Core run endpoint: `POST /run`
- Profiles: `fast | reasoning | code`
- Write tools are available only when request has `allowWrite: true`

## Where to read canonical docs

- Docs hub: `docs/index.md`
- Usage/setup: `docs/use-the-application.md`
- Endpoints: `docs/endpoint-map.md`
- Models/routing: `docs/model-selection.md`
- Package docs: `docs/packages/`
- Glossary: `docs/glossary.md`

Load `.ai/MODELS.md`, `.ai/TOOLS.md`, `.ai/ENVVARS.md`, and `.ai/STRUCTURE.md` only as brief navigation helpers.
