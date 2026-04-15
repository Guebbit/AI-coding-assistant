/**
 * Shared HTTP response helpers.
 *
 * Provides a typed response envelope and convenience helpers to create
 * and send success/rejection payloads consistently across API handlers.
 *
 * @module shared/response
 */

import type { Response } from 'express';

/**
 * Standard operational metadata attached to successful API responses.
 *
 * This object is intentionally optional and sparse: endpoints should only
 * populate fields that are genuinely available for that operation.
 */
export interface IResponseMeta {
    /** Wall-clock duration in milliseconds for the handled operation. */
    durationMs?: number;
    /** ISO 8601 timestamp indicating when processing started. */
    startedAt?: string;
    /** Prompt token count (when provided by the model/provider). */
    promptTokens?: number;
    /** Completion token count (when provided by the model/provider). */
    completionTokens?: number;
    /** Total token count (prompt + completion) when available. */
    totalTokens?: number;
    /** Single model used for the operation when exactly one is relevant. */
    model?: string;
    /** Multiple models used during a composed or routed operation. */
    models?: string[];
    /** Active model routing profile for the request when applicable. */
    profile?: string;
    /** Number of reasoning/orchestration steps executed when applicable. */
    steps?: number;
    /** Number of tool invocations performed when applicable. */
    toolCalls?: number;
    /** Final context length in characters when applicable. */
    contextLength?: number;
    /** Correlation identifier for the request, when available. */
    requestId?: string;
    /** Whether memory/context retrieval provided non-empty memory. */
    memoryUsed?: boolean;
}

/**
 * Shared neutral response fields used by both success and rejection payloads.
 */
export interface IResponseNeutral {
    /** Whether the request succeeded. */
    success: boolean;
    /** HTTP status code returned to the client. */
    status: number;
    /** Human-readable message describing the response. */
    message: string;
}

/**
 * Typed success response payload.
 *
 * @template T - Shape of the successful response data.
 */
export interface IResponseSuccess<T> extends IResponseNeutral {
    /** Optional business payload returned on success. */
    data?: T;
    /** Optional operational metadata for observability and diagnostics. */
    meta?: IResponseMeta;
    /** Success payloads cannot carry error arrays. */
    errors: never;
}

/**
 * Typed rejection response payload.
 */
export interface IResponseReject extends IResponseNeutral {
    /** Rejection payloads cannot carry success data. */
    data: never;
    /** Machine- and human-readable error details. */
    errors: string[];
}

/**
 * Build a success payload (not yet sent).
 *
 * @template T - Shape of the successful response data.
 * @param data - Payload to include in `data`.
 * @param status - HTTP status code to embed in the envelope.
 * @param message - Optional response message.
 * @param meta - Optional operational metadata.
 * @returns A typed success envelope.
 */
export const generateSuccess = <T>(
    data: T,
    status = 200,
    message = '',
    meta?: IResponseMeta
): IResponseSuccess<T> =>
    ({
        success: true,
        status,
        message,
        data,
        meta
    }) as IResponseSuccess<T>;

/**
 * Send a success response.
 *
 * @template T - Shape of the successful response data.
 * @param response - Express response object.
 * @param data - Payload to include in `data`.
 * @param status - HTTP status code.
 * @param message - Optional response message.
 * @param meta - Optional operational metadata.
 * @returns The Express response send result.
 */
export const successResponse = <T>(
    response: Response,
    data: T,
    status = 200,
    message = '',
    meta?: IResponseMeta
) => response.status(status).json(generateSuccess(data, status, message, meta));

/**
 * Build a rejection payload (not yet sent).
 *
 * @param status - HTTP status code to embed in the envelope.
 * @param message - Optional response message.
 * @param errors - Optional list of error details.
 * @returns A typed rejection envelope.
 */
export const generateReject = (
    status = 400,
    message = '',
    errors: string[] = []
): IResponseReject =>
    ({
        success: false,
        status,
        message,
        errors
    }) as IResponseReject;

/**
 * Send a rejection response.
 *
 * @param response - Express response object.
 * @param status - HTTP status code.
 * @param message - Optional response message.
 * @param errors - Optional list of error details.
 * @returns The Express response send result.
 */
export const rejectResponse = (
    response: Response,
    status = 400,
    message = '',
    errors: string[] = []
) => response.status(status).json(generateReject(status, message, errors));
