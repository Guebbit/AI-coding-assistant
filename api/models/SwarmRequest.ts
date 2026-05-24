/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type SwarmRequest = {
    /**
     * Natural-language description of the complex task to solve.
     */
    task: string;
    /**
     * When `true`, unlocks write tools for all subtask agents.
     */
    allowWrite?: boolean;
    /**
     * Force a specific model profile for all subtask agents,
     * overriding the decomposer's per-subtask suggestions.
     *
     */
    profile?: SwarmRequest.profile;
    /**
     * Maximum number of subtasks the decomposer may produce.
     */
    maxSubtasks?: number;
};
export namespace SwarmRequest {
    /**
     * Force a specific model profile for all subtask agents,
     * overriding the decomposer's per-subtask suggestions.
     *
     */
    export enum profile {
        FAST = 'fast',
        REASONING = 'reasoning',
        CODE = 'code',
    }
}

