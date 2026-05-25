/**
 * Decompose node — breaks the user task into structured subtasks.
 *
 * ROLE: First step in the swarm graph. Calls the task decomposer
 * and emits events so the UI can show progress.
 *
 * @module orchestrator/decompose-node
 */

import { emit } from '../events/bus';
import { logger } from '../logger/logger';
import { decomposeTask } from '../swarm/decomposer';
import type { ISwarmGraphState } from './state';

/**
 * Create the **decompose** node handler.
 *
 * Calls `decomposeTask()` to break the user task into a structured
 * `IDecomposition` plan, then emits the corresponding swarm events.
 *
 * @returns A LangGraph node function for the decompose step.
 */
export function createDecomposeNode() {
    return async (state: ISwarmGraphState): Promise<Partial<ISwarmGraphState>> => {
        logger.info('graph_node_decompose', {
            component: 'orchestrator.nodes',
            task: state.task,
            maxSubtasks: state.config.maxSubtasks ?? 6
        });

        emit({ type: 'swarm:start', payload: { task: state.task } });

        const decomposition = await decomposeTask(state.task, state.config.maxSubtasks);

        logger.info('graph_decomposition_complete', {
            component: 'orchestrator.nodes',
            subtaskCount: decomposition.subtasks.length,
            reasoning: decomposition.reasoning
        });

        emit({
            type: 'swarm:decomposed',
            payload: {
                subtaskCount: decomposition.subtasks.length,
                reasoning: decomposition.reasoning,
                subtasks: decomposition.subtasks.map((s) => ({
                    id: s.id,
                    description: s.description.slice(0, 100),
                    profile: s.profile
                }))
            }
        });

        return { decomposition };
    };
}
