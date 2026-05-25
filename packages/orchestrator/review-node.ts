/**
 * Review node + routing — decides retry vs proceed to synthesis.
 *
 * ROLE: Quality gate in the swarm graph. Checks subtask results and
 * either sends them back to execute (retry) or forward to synthesize.
 *
 * @module orchestrator/review-node
 */

import { logger } from '../logger/logger';
import type { ISwarmGraphState } from './state';

/**
 * Maximum number of review→retry cycles before forcing a synthesize.
 * Can be overridden via the `SWARM_MAX_REVIEW_RETRIES` environment variable.
 */
const MAX_REVIEW_RETRIES = Number.parseInt(process.env.SWARM_MAX_REVIEW_RETRIES ?? '1', 10);

/**
 * Create the **review** node handler.
 *
 * Decision logic:
 * 1. All subtasks succeeded → pass (go to synthesis).
 * 2. Some failed AND retries remain → fail (trigger retry).
 * 3. Retries exhausted → pass anyway (force synthesis with partial results).
 *
 * @returns A LangGraph node function for the review step.
 */
export function createReviewNode() {
    return async (state: ISwarmGraphState): Promise<Partial<ISwarmGraphState>> => {
        const { subtaskResults, retryCount } = state;

        const failedCount = subtaskResults.filter((r) => !r.success).length;
        const totalCount = subtaskResults.length;

        logger.info('graph_review', {
            component: 'orchestrator.nodes',
            total: totalCount,
            failed: failedCount,
            retryCount,
            maxRetries: MAX_REVIEW_RETRIES
        });

        if (failedCount === 0) {
            logger.info('graph_review_passed', {
                component: 'orchestrator.nodes',
                total: totalCount
            });
            return { reviewPassed: true };
        }

        if (retryCount < MAX_REVIEW_RETRIES) {
            logger.info('graph_review_retry_triggered', {
                component: 'orchestrator.nodes',
                failedCount,
                retriesRemaining: MAX_REVIEW_RETRIES - retryCount
            });
            return {
                reviewPassed: false,
                retryCount: retryCount + 1
            };
        }

        /* Retries exhausted — accept partial results. */
        logger.warn('graph_review_retries_exhausted', {
            component: 'orchestrator.nodes',
            failedCount,
            totalCount,
            retryCount
        });
        return { reviewPassed: true };
    };
}

/**
 * Conditional edge router for the review node.
 *
 * Returns `"execute_subtasks"` to trigger a retry, or `"synthesize"` to
 * proceed to final answer generation.
 */
export function reviewRouter(state: ISwarmGraphState): 'execute_subtasks' | 'synthesize' {
    return state.reviewPassed ? 'synthesize' : 'execute_subtasks';
}
