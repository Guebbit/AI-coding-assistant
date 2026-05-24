/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { LogEntry } from './LogEntry';
export type LogsErrorsResponse = {
    /**
     * Filtered error log entries, newest first.
     */
    entries: Array<LogEntry>;
    /**
     * Total number of entries that matched the applied filters.
     */
    total: number;
    /**
     * Path of the error log file that was read.
     */
    logFile: string;
    diagnostics: {
        /**
         * Basenames of the most recent per-run diagnostic Markdown
         * files from `DIAGNOSTIC_LOG_DIR` (up to 10, newest first).
         * Empty when no diagnostic files exist.
         *
         */
        recentFiles: Array<string>;
    };
};

