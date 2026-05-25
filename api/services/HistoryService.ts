/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ActivityLogDeleteResponse } from '../models/ActivityLogDeleteResponse';
import type { ActivityLogExportResponse } from '../models/ActivityLogExportResponse';
import type { ActivityLogListResponse } from '../models/ActivityLogListResponse';
import type { ActivityLogPollResponse } from '../models/ActivityLogPollResponse';
import type { SuccessEnvelope } from '../models/SuccessEnvelope';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class HistoryService {
    /**
     * Incrementally list persistent activity history
     * Cursor-based incremental history fetch over the append-only MongoDB `activity_log`.
     * Returns entries sorted by `_id` ascending for straightforward frontend synchronization.
     *
     * @param since Mongo ObjectId cursor. Returns records with `_id` greater than this cursor.
     * @param limit Maximum number of records to return (default 100, max 500).
     * @param runId
     * @param requestId
     * @param conversationId
     * @returns any History page returned successfully.
     * @throws ApiError
     */
    public static getHistory(
        since?: string,
        limit: number = 100,
        runId?: string,
        requestId?: string,
        conversationId?: string,
    ): CancelablePromise<(SuccessEnvelope & {
        data?: ActivityLogListResponse;
    })> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/history',
            query: {
                'since': since,
                'limit': limit,
                'runId': runId,
                'requestId': requestId,
                'conversationId': conversationId,
            },
            errors: {
                400: `Invalid request body or parameters`,
                503: `Database is unavailable — retry later`,
            },
        });
    }
    /**
     * Clear all history (or a scoped subset)
     * Deletes all activity-log records, or only records matching optional query filters
     * such as `runId`, `requestId`, or `conversationId`.
     *
     * @param runId
     * @param requestId
     * @param conversationId
     * @returns any History clear operation completed.
     * @throws ApiError
     */
    public static deleteHistory(
        runId?: string,
        requestId?: string,
        conversationId?: string,
    ): CancelablePromise<(SuccessEnvelope & {
        data?: ActivityLogDeleteResponse;
    })> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/history',
            query: {
                'runId': runId,
                'requestId': requestId,
                'conversationId': conversationId,
            },
            errors: {
                400: `Invalid request body or parameters`,
                503: `Database is unavailable — retry later`,
            },
        });
    }
    /**
     * Export persistent activity history
     * Returns a download-friendly JSON envelope containing exported history records.
     * Supports optional cursor filtering with `since`.
     *
     * @param since Optional Mongo ObjectId cursor.
     * @returns any History export returned successfully.
     * @throws ApiError
     */
    public static getHistoryExport(
        since?: string,
    ): CancelablePromise<(SuccessEnvelope & {
        data?: ActivityLogExportResponse;
    })> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/history/export',
            query: {
                'since': since,
            },
            errors: {
                400: `Invalid request body or parameters`,
                503: `Database is unavailable — retry later`,
            },
        });
    }
    /**
     * Optional long-poll incremental history endpoint
     * Performs immediate Mongo query for new records after `since`.
     * If empty, loops with sleep/retry until timeout.
     * Enabled only when `HISTORY_LONG_POLL_ENABLED=true`.
     *
     * @param since
     * @param limit
     * @param timeoutMs
     * @returns any Poll response returned (with records or timeout indicator).
     * @throws ApiError
     */
    public static getHistoryPoll(
        since?: string,
        limit: number = 100,
        timeoutMs: number = 30000,
    ): CancelablePromise<(SuccessEnvelope & {
        data?: ActivityLogPollResponse;
    })> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/history/poll',
            query: {
                'since': since,
                'limit': limit,
                'timeoutMs': timeoutMs,
            },
            errors: {
                400: `Invalid request body or parameters`,
                404: `The requested resource was not found`,
                503: `Database is unavailable — retry later`,
            },
        });
    }
}
