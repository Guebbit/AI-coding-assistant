/**
 * LangGraph orchestrator node factories — barrel re-export.
 *
 * Architecture (SRP split):
 *  - `decompose-node.ts`  — task decomposition into subtasks
 *  - `execute-node.ts`    — subtask execution with dependency resolution
 *  - `review-node.ts`     — quality gate + retry/proceed routing
 *  - `synthesize-node.ts` — final answer synthesis from subtask results
 *
 * Node flow:
 * ```
 * decompose → execute_subtasks → review ──► synthesize → END
 *                  ▲                  │
 *                  └── (retry loop) ◄─┘
 * ```
 *
 * @module orchestrator/nodes
 */

export { createDecomposeNode } from './decompose-node';
export { createExecuteSubtasksNode } from './execute-node';
export { createReviewNode, reviewRouter } from './review-node';
export { createSynthesizeNode } from './synthesize-node';

