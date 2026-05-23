/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Optional request-level controls for tool selection.
 * These controls are designed for guidance and scoped authorization,
 * and never bypass platform capability gates (e.g., write-tool gating).
 *
 */
export type ToolPolicy = {
    /**
     * How to interpret this policy:
     * - `guidance` — ranking/selection hints only.
     * - `authorization` — request-scoped executable-set constraint.
     * - `hybrid` — enforce denylist while using allowlist/preferred as hints.
     *
     */
    mode?: ToolPolicy.mode;
    /**
     * Candidate tools to prioritize or permit for this request.
     */
    allowlist?: Array<string>;
    /**
     * Tools to avoid or block for this request.
     */
    denylist?: Array<string>;
    /**
     * Soft-priority tools for reranking when viable.
     */
    preferred?: Array<string>;
};
export namespace ToolPolicy {
    /**
     * How to interpret this policy:
     * - `guidance` — ranking/selection hints only.
     * - `authorization` — request-scoped executable-set constraint.
     * - `hybrid` — enforce denylist while using allowlist/preferred as hints.
     *
     */
    export enum mode {
        GUIDANCE = 'guidance',
        AUTHORIZATION = 'authorization',
        HYBRID = 'hybrid',
    }
}

