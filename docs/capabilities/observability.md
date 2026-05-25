# Observability Capability

Owns operational visibility: events, logging, diagnostics, and evaluation signals.

Current implementation map:

- `packages/events`
- `packages/persistence/activity-log.ts` (Mongo-backed persistent `activity_log`)
- `packages/logger`
- `packages/diagnostics`
- `packages/evals`
- `apps/api/history-endpoints.ts` (`/history*` API surface)

Reference pages:

- [events](/packages/events)
- [Event-Driven Observability](/theory/events-observability)
- [Endpoint Map](/endpoint-map)
