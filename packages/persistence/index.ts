/**
 * Public surface of the persistence package.
 *
 * Re-exports all types and DB helpers so consumers can import from a
 * single entry point:
 *
 * ```typescript
 * import { saveAgentRun, saveSwarmRun, saveEvalResult, fetchRecentRuns } from '../persistence';
 * import type { IAgentRunRecord, ISwarmRunRecord, IEvalResultRecord } from '../persistence';
 * ```
 *
 * Architecture (SRP split):
 *  - `pool.ts`       — PG pool singleton + fail-open withClient executor
 *  - `agent-runs.ts` — Agent/swarm/eval run persistence
 *  - `chat.ts`       — Conversation + message CRUD
 *  - `library.ts`    — Library + article CRUD
 *  - `activity-log.ts` — MongoDB-backed append-only activity history
 *  - `db.ts`         — Barrel re-export for backward compat
 *
 * @module persistence
 */

export * from './types';
export * from './db';
export { runMigrations } from './migrate';
