/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ActivityLogListResponse } from './ActivityLogListResponse';
export type ActivityLogPollResponse = (ActivityLogListResponse & {
    timedOut: boolean;
    pollDurationMs: number;
    pollTimeoutMs: number;
});

