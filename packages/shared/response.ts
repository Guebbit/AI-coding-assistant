/**
 * Shared HTTP response helpers.
 *
 * Provides a typed response envelope and convenience helpers to create
 * and send success/rejection payloads consistently across API handlers.
 *
 * @module shared/response
 */

declare module 'express-serve-static-core' {
    interface Request {
        requestId?: string;
    }
}

import type { Request, Response } from 'express';
import type { ResponseMeta as ApiResponseMeta } from '../../api/models';

/**
 * Standard operational metadata attached to successful API responses.
 *
 * This object is intentionally optional and sparse: endpoints should only
 * populate fields that are genuinely available for that operation.
 */
export type IResponseMeta = ApiResponseMeta;

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

/**
 * Build standard response metadata from an Express request + start time.
 * Centralises the repeated { startedAt, durationMs, requestId } pattern.
 */
export function buildResponseMeta(startedAt: Date, req?: Request): IResponseMeta {
    return {
        startedAt: startedAt.toISOString(),
        durationMs: Date.now() - startedAt.getTime(),
        ...(req?.requestId !== undefined ? { requestId: req.requestId } : {}),
    };
}

/**
 * Sum prompt + completion token counts, returning undefined when either is absent.
 */
export function sumTokens(promptTokens?: number, completionTokens?: number): number | undefined {
    return typeof promptTokens === 'number' && typeof completionTokens === 'number'
        ? promptTokens + completionTokens
        : undefined;
}
