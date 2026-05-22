# Manna AI context index

MANDATORY: read this file first every session, then read the root `README.md`.

## Purpose of `.ai/*`

`.ai/*` is **AI-only navigation context**. It is intentionally brief.

The **single source of truth** for "what is Manna and how is it built" is
the root **[`README.md`](../README.md)**. All `.ai/*.md` files are navigation
aids that must stay consistent with README.md.

## Fast orientation

- Repo: `Guebbit/manna`
- Stack: TypeScript + Node.js (ESM, Node ≥ 18)
- API entrypoint: `apps/api/index.ts`
- Core run endpoint: `POST /run`
- Profiles: `fast | reasoning | code` (no `default` profile)
- Operating modes: `low-spec | standard | high-trust` (default `standard`)
- Write tools are available only when request has `allowWrite: true`

## Where to read canonical docs

- Identity / architecture (source of truth): `README.md`
- Docs hub: `docs/index.md`
- Usage/setup: `docs/use-the-application.md`
- Endpoints: `docs/endpoint-map.md` (+ `openapi.yaml`)
- Models/routing: `docs/model-selection.md`
- Package docs: `docs/packages/`
- Glossary: `docs/glossary.md`

Load `.ai/MODELS.md`, `.ai/TOOLS.md`, `.ai/ENVVARS.md`, `.ai/STRUCTURE.md`, and
`.ai/STYLE.md` only as brief navigation helpers — the README is authoritative.
