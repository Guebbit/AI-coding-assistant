/**
 * Shared error classes.
 *
 * @module shared/errors
 */

import { logger } from '../logger/logger';

/**
 * Extended application error carrying HTTP semantics and operational metadata.
 */
export class ExtendedError extends Error {
    /** Error class name exposed to clients and logs. */
    public readonly name: string;
    /** HTTP status code associated with this error. */
    public readonly httpCode: number;
    /** Whether the error is operational and expected. */
    public readonly isOperational: boolean;
    /** Optional detailed error entries. */
    public readonly errors: string[];

    /**
     * Build a new extended error instance.
     *
     * @param name - Error name/category.
     * @param httpCode - HTTP status code.
     * @param isOperational - Whether this is an expected operational failure.
     * @param errors - Detailed error entries.
     */
    constructor(name: string, httpCode: number, isOperational = false, errors: string[] = []) {
        super(`${name}: ${errors.join('. ')}`);
        Object.setPrototypeOf(this, new.target.prototype);
        this.name = name;
        this.httpCode = httpCode;
        this.isOperational = isOperational;
        this.errors = errors;

        if (!isOperational) {
            logger.error({
                component: 'shared.errors',
                message: this.message,
                stack: this.stack,
                name: this.name,
                errors: this.errors,
                httpCode: this.httpCode
            });
        }
    }
}
