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
 * import { fetchRecentAgentRuns } from '../evals/persist';
 *
 * const agentRuns = await fetchRecentAgentRuns(5);
 * ```
 *
 * @module evals/persist
 */

import { saveEvalResult, fetchRecentRuns } from '../persistence/database';
import type { IEvalResultRecord, IAgentRunRecord } from '../persistence/types';
import type { IScorer, IScorerRunInput } from './types';
import { logger } from '../logger/logger';

/**
 * Extended scorer input that includes optional run association fields.
 */
export interface IScorerRunInputWithRunId extends IScorerRunInput {
    /** UUID of the associated agent run (optional). */
    runId?: string | null;
    /** Whether `runId` refers to an agent run. */
    runType?: 'agent' | null;
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
export function scoreAndPersist(
    scorer: IScorer,
    input: IScorerRunInputWithRunId
): Promise<IEvalResultRecord | null> {
    return scorer
        .score(input)
        .catch((error: unknown) => {
            logger.warn('evals_scorer_failed', {
                component: 'evals.persist',
                scorer: scorer.id,
                error: String(error)
            });
            return null;
        })
        .then((scorerResult) => {
            if (scorerResult === null) return null;
            return saveEvalResult({
                runId: input.runId ?? null,
                runType: input.runType ?? null,
                scorer: scorer.id,
                score: scorerResult.score,
                reasoning: scorerResult.reasoning,
                metadata: scorerResult.metadata ?? null
            });
        });
}

/**
 * Fetch the most recent agent runs from the database.
 *
 * @param limit - Maximum number of records to return (default: 20).
 * @returns Array of agent run records (newest first), or `[]` if unavailable.
 */
export async function fetchRecentAgentRuns(limit = 20): Promise<IAgentRunRecord[]> {
    return fetchRecentRuns({ limit }) as Promise<IAgentRunRecord[]>;
}
