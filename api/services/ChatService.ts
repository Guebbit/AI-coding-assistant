/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ChatMessage } from '../models/ChatMessage';
import type { Conversation } from '../models/Conversation';
import type { ConversationWithMessages } from '../models/ConversationWithMessages';
import type { CreateConversationRequest } from '../models/CreateConversationRequest';
import type { CreateMessageRequest } from '../models/CreateMessageRequest';
import type { SuccessEnvelope } from '../models/SuccessEnvelope';
import type { UpdateConversationRequest } from '../models/UpdateConversationRequest';
import type { UpdateMessageRequest } from '../models/UpdateMessageRequest';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class ChatService {
    /**
     * List all conversations
     * Returns all conversations ordered newest first. Messages are not included.
     * @returns any Conversation list
     * @throws ApiError
     */
    public static listConversations(): CancelablePromise<(SuccessEnvelope & {
        data?: {
            count?: number;
            conversations?: Array<Conversation>;
        };
    })> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/chat/conversations',
            errors: {
                503: `Database is unavailable — retry later`,
            },
        });
    }
    /**
     * Create a new conversation
     * @param requestBody
     * @returns any Conversation created
     * @throws ApiError
     */
    public static createConversation(
        requestBody?: CreateConversationRequest,
    ): CancelablePromise<(SuccessEnvelope & {
        data?: {
            conversation?: Conversation;
        };
    })> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/chat/conversations',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Invalid request body or parameters`,
                503: `Database is unavailable — retry later`,
            },
        });
    }
    /**
     * Get a conversation with all its messages
     * @param conversationId UUID of the conversation.
     * @returns any Conversation with messages
     * @throws ApiError
     */
    public static getConversation(
        conversationId: string,
    ): CancelablePromise<(SuccessEnvelope & {
        data?: {
            conversation?: ConversationWithMessages;
        };
    })> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/chat/conversations/{conversationId}',
            path: {
                'conversationId': conversationId,
            },
            errors: {
                404: `The requested resource was not found`,
                503: `Database is unavailable — retry later`,
            },
        });
    }
    /**
     * Update a conversation's title or profile
     * @param conversationId UUID of the conversation.
     * @param requestBody
     * @returns any Conversation updated
     * @throws ApiError
     */
    public static updateConversation(
        conversationId: string,
        requestBody: UpdateConversationRequest,
    ): CancelablePromise<(SuccessEnvelope & {
        data?: {
            conversation?: Conversation;
        };
    })> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/chat/conversations/{conversationId}',
            path: {
                'conversationId': conversationId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Invalid request body or parameters`,
                404: `The requested resource was not found`,
                503: `Database is unavailable — retry later`,
            },
        });
    }
    /**
     * Delete a conversation and all its messages
     * @param conversationId UUID of the conversation.
     * @returns any Conversation deleted
     * @throws ApiError
     */
    public static deleteConversation(
        conversationId: string,
    ): CancelablePromise<(SuccessEnvelope & {
        data?: {
            deleted?: boolean;
        };
    })> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/chat/conversations/{conversationId}',
            path: {
                'conversationId': conversationId,
            },
            errors: {
                404: `The requested resource was not found`,
                503: `Database is unavailable — retry later`,
            },
        });
    }
    /**
     * Add a message to a conversation (JSON)
     * Creates and persists a chat message and returns a normal JSON envelope.
     * For live assistant streaming, use `POST /chat/conversations/{conversationId}/messages/stream`.
     *
     * @param conversationId UUID of the conversation.
     * @param requestBody
     * @returns any Message created
     * @throws ApiError
     */
    public static createMessage(
        conversationId: string,
        requestBody: CreateMessageRequest,
    ): CancelablePromise<(SuccessEnvelope & {
        data?: {
            message?: ChatMessage;
        };
    })> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/chat/conversations/{conversationId}/messages',
            path: {
                'conversationId': conversationId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Invalid request body or parameters`,
                404: `The requested resource was not found`,
                503: `Database is unavailable — retry later`,
            },
        });
    }
    /**
     * Add a user message and stream the assistant reply
     * Creates a `user` message, then streams SSE events for the saved user message
     * and the generated assistant reply.
     *
     * This endpoint requires `role: user` in the request body.
     *
     * **SSE event types**:
     * - `message` — the persisted user message (`ChatMessage`)
     * - `reply` — the persisted assistant message plus generation metadata
     * - `error` — stream failure payload `{ error }`
     *
     * @param conversationId UUID of the conversation.
     * @param requestBody
     * @returns string SSE stream — connection kept open until the assistant generation finishes.
     *
     * SSE event payload schemas:
     * - `message` event: `ChatMessage`
     * - `reply` event: `{ message: ChatMessage, meta: ResponseMeta & token/model metadata }`
     * - `error` event: `SseErrorEvent`
     *
     * @throws ApiError
     */
    public static createMessageStream(
        conversationId: string,
        requestBody: CreateMessageRequest,
    ): CancelablePromise<string> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/chat/conversations/{conversationId}/messages/stream',
            path: {
                'conversationId': conversationId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Invalid request body or parameters`,
                404: `The requested resource was not found`,
                503: `Database is unavailable — retry later`,
            },
        });
    }
    /**
     * Edit a message's content
     * @param conversationId UUID of the conversation.
     * @param messageId UUID of the message.
     * @param requestBody
     * @returns any Message updated
     * @throws ApiError
     */
    public static updateMessage(
        conversationId: string,
        messageId: string,
        requestBody: UpdateMessageRequest,
    ): CancelablePromise<(SuccessEnvelope & {
        data?: {
            message?: ChatMessage;
        };
    })> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/chat/conversations/{conversationId}/messages/{messageId}',
            path: {
                'conversationId': conversationId,
                'messageId': messageId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Invalid request body or parameters`,
                404: `The requested resource was not found`,
                503: `Database is unavailable — retry later`,
            },
        });
    }
    /**
     * Delete a single message
     * @param conversationId UUID of the conversation.
     * @param messageId UUID of the message.
     * @returns any Message deleted
     * @throws ApiError
     */
    public static deleteMessage(
        conversationId: string,
        messageId: string,
    ): CancelablePromise<(SuccessEnvelope & {
        data?: {
            deleted?: boolean;
        };
    })> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/chat/conversations/{conversationId}/messages/{messageId}',
            path: {
                'conversationId': conversationId,
                'messageId': messageId,
            },
            errors: {
                404: `The requested resource was not found`,
                503: `Database is unavailable — retry later`,
            },
        });
    }
}
