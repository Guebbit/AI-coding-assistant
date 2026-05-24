/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { LogsErrorsResponse } from '../models/LogsErrorsResponse';
import type { SuccessEnvelope } from '../models/SuccessEnvelope';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class LogsService {
    /**
     * List recent error-level log entries
     * Returns JSON-line entries from `LOG_ERROR_FILE` (default `error.log`) in
     * reverse-chronological order.  Entries are the raw Winston structured log
     * objects; non-parseable lines are silently skipped.
     *
     * Also includes a short list of recent per-run diagnostic Markdown file
     * names from `DIAGNOSTIC_LOG_DIR` for cross-reference.
     *
     * @param limit Maximum number of entries to return (default 100, max 500).
     * @param component Filter entries by the `component` field.
     * @param requestId Filter entries by the `requestId` field.
     * @param code Filter entries by the `code` field (e.g. `E_CONSECUTIVE_ERRORS`).
     * @param since Return only entries with a `timestamp` after this ISO 8601 value.
     * @returns any Log entries returned successfully
     * @throws ApiError
     */
    public static getLogsErrors(
        limit: number = 100,
        component?: string,
        requestId?: string,
        code?: string,
        since?: string,
    ): CancelablePromise<(SuccessEnvelope & {
        data?: LogsErrorsResponse;
    })> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/logs/errors',
            query: {
                'limit': limit,
                'component': component,
                'requestId': requestId,
                'code': code,
                'since': since,
            },
            errors: {
                400: `Invalid request body or parameters`,
                500: `Internal server error (LLM failure, Qdrant unavailable, etc.)`,
            },
        });
    }
}
