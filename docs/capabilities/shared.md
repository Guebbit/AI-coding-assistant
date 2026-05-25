# Shared Capability

Owns only small, truly generic helpers reused across capabilities.

Rules:

- Keep it minimal.
- No domain/business ownership here.
- If logic is capability-specific, move it to that capability.

Current implementation map:

- `packages/shared/*` (path safety, env validation, envelopes, common utilities)

Reference pages:

- [Packages Overview](/packages/)
- [Capability-Oriented Modular Monolith](/theory/capability-modular-monolith)
