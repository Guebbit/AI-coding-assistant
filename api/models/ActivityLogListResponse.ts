/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ActivityLogEntry } from './ActivityLogEntry';
export type ActivityLogListResponse = {
    entries: Array<ActivityLogEntry>;
    count: number;
    nextCursor?: string | null;
    hasMore: boolean;
};

