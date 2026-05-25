/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ActivityLogEntry = {
    /**
     * Mongo ObjectId string.
     */
    id: string;
    timestamp: string;
    /**
     * Full internal event kind (e.g. `agent:step`, `workflow:done`).
     */
    kind: string;
    category: string;
    type: string;
    conversationId?: string;
    messageId?: string;
    requestId?: string;
    runId?: string;
    workflowId?: string;
    subtaskId?: string;
    parentId?: string;
    profile?: string;
    toolName?: string;
    status?: string;
    data: Record<string, any>;
    meta?: Record<string, any>;
};

