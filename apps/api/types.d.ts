/**
 * Express type augmentations for API-level request metadata.
 *
 * @module apps/api/types
 */

declare namespace Express {
    interface Request {
        /** Correlation identifier assigned by requestIdMiddleware. */
        requestId?: string;
    }
}
