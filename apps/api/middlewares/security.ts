/**
 * Security middlewares — rate limiting and request-ID correlation.
 *
 * @module apps/api/middlewares/security
 */

import crypto from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import type { NextFunction, Request, Response } from 'express';

/**
 * Parse a positive integer environment variable with safe fallback.
 *
 * @param rawValue - Raw environment variable value.
 * @param fallback - Fallback value when parsing fails.
 * @returns A positive integer.
 */
function parsePositiveInt(rawValue: string | undefined, fallback: number): number {
    const parsed = Number.parseInt(rawValue ?? String(fallback), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const rateLimitWindowMs = parsePositiveInt(process.env.RATE_LIMIT_WINDOW_MS, 900000);
const rateLimitMax = parsePositiveInt(process.env.RATE_LIMIT_MAX, 100);

/**
 * Global rate limiter applied before any DB or LLM access.
 *
 * Defaults to 100 requests per IP per 15-minute window.
 */
export const rateLimiter = rateLimit({
    windowMs: rateLimitWindowMs,
    limit: rateLimitMax,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
});

/**
 * Request-ID correlation middleware.
 *
 * Reuses the client-supplied `x-request-id` header if present,
 * otherwise generates a new UUID. Injects `request.requestId`
 * and echoes the ID back in the response header.
 *
 * @param request - Express request object.
 * @param response - Express response object.
 * @param next - Express next function.
 */
export const requestIdMiddleware = (
    request: Request,
    response: Response,
    next: NextFunction,
): void => {
    const requestId = request.get('x-request-id') ?? crypto.randomUUID();
    request.requestId = requestId;
    response.setHeader('x-request-id', requestId);
    next();
};
