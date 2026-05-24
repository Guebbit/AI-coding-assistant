/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { StepDefinition } from './StepDefinition';
export type WorkflowRequest = {
    /**
     * Ordered list of workflow step definitions.
     *
     */
    steps: Array<StepDefinition>;
    /**
     * When `true`, unlocks `write_file`, `scaffold_project`, and `document_ingest`
     * tools for all steps.
     *
     */
    allowWrite?: boolean;
    /**
     * Force a specific model profile for all steps, bypassing automatic routing.
     *
     */
    profile?: WorkflowRequest.profile;
    /**
     * How prior step outputs are carried into subsequent steps.
     * `none` = isolated; `summary` = compact bullet summary (default);
     * `full` = verbatim full output.
     *
     */
    carry?: WorkflowRequest.carry;
    /**
     * Per-step agent-loop iteration cap.  Overrides `AGENTS_MAX_STEPS` for this
     * request only.  Defaults to `AGENTS_MAX_STEPS` (env var, default 20).
     *
     */
    maxStepsPerStep?: number;
};
export namespace WorkflowRequest {
    /**
     * Force a specific model profile for all steps, bypassing automatic routing.
     *
     */
    export enum profile {
        FAST = 'fast',
        REASONING = 'reasoning',
        CODE = 'code',
    }
    /**
     * How prior step outputs are carried into subsequent steps.
     * `none` = isolated; `summary` = compact bullet summary (default);
     * `full` = verbatim full output.
     *
     */
    export enum carry {
        NONE = 'none',
        SUMMARY = 'summary',
        FULL = 'full',
    }
}

