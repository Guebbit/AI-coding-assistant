/**
 * Eval persistence helpers — convenience wrappers that run a scorer and
 * immediately persist the result to PostgreSQL.
 *
 * These functions demonstrate how `saveEvalResult` and `fetchRecentRuns`
 * are used in practice, and are the recommended way to score + persist in
 * a single call.
 *
 * ## Example — score an agent run and save the result
 *
 * ```typescript
 * import { scoreAndPersist } from '../evals/persist';
 * import { toolAccuracyScorer } from '../evals';
 *
 * const evalRecord = await scoreAndPersist(toolAccuracyScorer, {
 *   input: 'List files in /tmp',
 *   output: 'file1.txt, file2.txt',
 *   metadata: { toolsUsed: ['shell'], toolErrors: [], stepCount: 1 },
 *   runId: agentRunRecord?.id,
 *   runType: 'agent',
 * });
 * console.log('Eval score:', evalRecord?.score);
 * ```
 *
 * ## Example — fetch recent agent runs from the DB
 *
 * ```typescript
 * import { fetchRecentAgentRuns, fetchRecentSwarmRuns } from '../evals/persist';
 *
 * const agentRuns = await fetchRecentAgentRuns(5);
 * const swarmRuns = await fetchRecentSwarmRuns(5);
 * ```
 *
 * @module evals/persist
 */

import { saveEvalResult, fetchRecentRuns } from '../persistence/db';
import type { IEvalResultRecord, IAgentRunRecord, ISwarmRunRecord } from '../persistence/types';
import type { IScorer, IScorerRunInput } from './types';
import { getLogger } from '../logger/logger';

const log = getLogger('evals:persist');

/**
 * Extended scorer input that includes optional run association fields.
 */
export interface IScorerRunInputWithRunId extends IScorerRunInput {
    /** UUID of the associated agent or swarm run (optional). */
    runId?: string | null;
    /** Whether `runId` refers to an agent or swarm run. */
    runType?: 'agent' | 'swarm' | null;
}

/**
 * Run a scorer against the given input and immediately persist the result
 * to PostgreSQL.
 *
 * Fail-open: if the scorer throws or the DB is unavailable, a warning is
 * logged and `null` is returned so the caller is never blocked.
 *
 * @param scorer - The scorer to run.
 * @param input  - The run description (task input, agent output, optional metadata).
 * @returns The persisted eval result record, or `null` on failure.
 */
export async function scoreAndPersist(
    scorer: IScorer,
    input: IScorerRunInputWithRunId
): Promise<IEvalResultRecord | null> {
    let scorerResult;
    try {
        scorerResult = await scorer.score(input);
    } catch (error: unknown) {
        log.warn('evals_scorer_failed', { scorer: scorer.id, error: String(error) });
        return null;
    }

    return saveEvalResult({
        runId: input.runId ?? null,
        runType: input.runType ?? null,
        scorer: scorer.id,
        score: scorerResult.score,
        reasoning: scorerResult.reasoning,
        metadata: scorerResult.metadata ?? null
    });
}

/**
 * Fetch the most recent agent runs from the database.
 *
 * @param limit - Maximum number of records to return (default: 20).
 * @returns Array of agent run records (newest first), or `[]` if unavailable.
 */
export async function fetchRecentAgentRuns(limit = 20): Promise<IAgentRunRecord[]> {
    return fetchRecentRuns({ type: 'agent', limit }) as Promise<IAgentRunRecord[]>;
}

/**
 * Fetch the most recent swarm runs from the database.
 *
 * @param limit - Maximum number of records to return (default: 20).
 * @returns Array of swarm run records (newest first), or `[]` if unavailable.
 */
export async function fetchRecentSwarmRuns(limit = 20): Promise<ISwarmRunRecord[]> {
    return fetchRecentRuns({ type: 'swarm', limit }) as Promise<ISwarmRunRecord[]>;
}
