/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * A single parsed Winston JSON log line from the error log file.
 * Fields beyond the documented ones may be present depending on the
 * logging context (e.g. `tool`, `step`, `taskLength`).
 *
 */
export type LogEntry = {
    /**
     * ISO 8601 timestamp set by Winston.
     */
    timestamp?: string;
    /**
     * Log severity (always `"error"` in this endpoint).
     */
    level?: string;
    /**
     * Human-readable log message.
     */
    message?: string;
    /**
     * Subsystem that emitted the log line.
     */
    component?: string;
    /**
     * Request correlation ID when available.
     */
    requestId?: string;
    /**
     * Typed error code when the entry records a classified failure.
     */
    code?: string;
    /**
     * Service name set in Winston defaultMeta.
     */
    service?: string;
};

