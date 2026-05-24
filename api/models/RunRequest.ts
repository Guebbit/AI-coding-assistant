/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ToolPolicy } from './ToolPolicy';
export type RunRequest = {
    /**
     * Natural-language description of what the agent should do.
     */
    task: string;
    /**
     * When `true`, unlocks the `write_file`, `scaffold_project`, and `document_ingest` tools.
     * Default `false`.
     *
     */
    allowWrite?: boolean;
    /**
     * Force a specific model profile, bypassing automatic routing.
     * If omitted, the router selects a profile based on the task text.
     *
     */
    profile?: RunRequest.profile;
    toolPolicy?: ToolPolicy;
};
export namespace RunRequest {
    /**
     * Force a specific model profile, bypassing automatic routing.
     * If omitted, the router selects a profile based on the task text.
     *
     */
    export enum profile {
        FAST = 'fast',
        REASONING = 'reasoning',
        CODE = 'code',
    }
}

