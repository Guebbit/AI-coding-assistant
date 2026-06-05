/**
 * Public surface of the persistence package.
 *
 * Re-exports all types and DB helpers so consumers can import from a
 * single entry point:
 *
 * ```typescript
 * import { saveAgentRun, saveEvalResult, fetchRecentRuns } from '../persistence';
 * import type { IAgentRunRecord, IEvalResultRecord } from '../persistence';
 * ```
 *
 * Architecture (SRP split):
 *  - `pool.ts`       — PG pool singleton + fail-open withClient executor
 *  - `agent-runs.ts` — Agent/eval run persistence
 *  - `chat.ts`       — Conversation + message CRUD
 *  - `library.ts`    — Library + article CRUD
 *  - `activity-log.ts` — MongoDB-backed append-only activity history
 *  - `db.ts`         — Barrel re-export for backward compat
 *
 * @module persistence
 */

export * from './types';
export * from './database';
export { runMigrations } from './migrate';
