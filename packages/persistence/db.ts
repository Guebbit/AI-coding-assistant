/**
 * Persistence layer — barrel re-export from domain-split modules.
 *
 * ## Architecture
 *
 * The persistence package is split by domain (SRP):
 *   - `pool.ts`       — PG pool singleton + fail-open `withClient` executor
 *   - `agent-runs.ts` — Agent/eval run CRUD
 *   - `chat.ts`       — Conversation + message CRUD
 *   - `library.ts`    — Library + article CRUD
 *   - `activity-log.ts` — MongoDB-backed append-only activity history
 *
 * This file re-exports everything for backward compat — existing
 * `import { saveAgentRun } from '../persistence/db'` still works.
 *
 * ## Design principles
 *
 * - **Fail-open**: DB errors → warn log + return null/[]. App never crashes.
 * - **Lazy init**: Pool created on first call. Zero overhead if unused.
 * - **Type-safe**: All I/O uses types from `./types`.
 *
 * @module persistence/db
 */

export { getPool, closePool } from './pool';
export { saveAgentRun, saveEvalResult, fetchRecentRuns } from './agent-runs';
export {
    listConversations,
    createConversation,
    getConversation,
    updateConversation,
    deleteConversation,
    createMessage,
    updateMessage,
    deleteMessage
} from './chat';
export {
    listLibraries,
    getLibrary,
    upsertLibrary,
    updateLibraryStats,
    createArticle,
    listArticles,
    countArticles
} from './library';
export {
    getActivityLogAvailability,
    appendActivityLog,
    listActivityLog,
    exportActivityLog,
    clearActivityLog
} from './activity-log';
