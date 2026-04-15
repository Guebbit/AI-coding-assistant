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
 * @returns A typed success envelope.
 */
export const generateSuccess = <T>(data: T, status = 200, message = ''): IResponseSuccess<T> =>
    ({
        success: true,
        status,
        message,
        data
    }) as IResponseSuccess<T>;

/**
 * Send a success response.
 *
 * @template T - Shape of the successful response data.
 * @param response - Express response object.
 * @param data - Payload to include in `data`.
 * @param status - HTTP status code.
 * @param message - Optional response message.
 * @returns The Express response send result.
 */
export const successResponse = <T>(response: Response, data: T, status = 200, message = '') =>
    response.status(status).json(generateSuccess(data, status, message));

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
