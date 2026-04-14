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
 * @module persistence
 */

export * from './types';
export * from './db';
export { runMigrations } from './migrate';
