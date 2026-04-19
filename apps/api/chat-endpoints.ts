/**
 * Chat REST endpoints — CRUD for conversations and messages.
 *
 * All routes are fail-open: if the database is unavailable the helpers
 * return `null` and we respond with 503 so the client can retry.
 *
 * Route table:
 *
 * | Method | Path                                        | Action                        |
 * |--------|---------------------------------------------|-------------------------------|
 * | GET    | /chat/conversations                         | List conversations (no msgs)  |
 * | POST   | /chat/conversations                         | Create conversation           |
 * | GET    | /chat/conversations/:id                     | Get conversation + messages   |
 * | PUT    | /chat/conversations/:id                     | Update title / profile        |
 * | DELETE | /chat/conversations/:id                     | Delete conversation + cascade |
 * | POST   | /chat/conversations/:id/messages            | Add a message                 |
 * | PUT    | /chat/conversations/:id/messages/:msgId     | Edit message content          |
 * | DELETE | /chat/conversations/:id/messages/:msgId     | Delete a single message       |
 *
 * @module apps/api/chat-endpoints
 */

import type express from 'express';
import type { ModelProfile } from '@/packages/agent/model-router';
import { routeModel } from '@/packages/agent/model-router';
import { chatWithMetadata } from '@/packages/llm/ollama';
import type { IOllamaChatMessage } from '@/packages/llm/ollama';
import { logger } from '@/packages/logger/logger';
import { rejectResponse, successResponse, buildResponseMeta, sumTokens } from '@/packages/shared';
import {
    listConversations,
    createConversation,
    getConversation,
    updateConversation,
    deleteConversation,
    createMessage,
    updateMessage,
    deleteMessage
} from '@/packages/persistence/db';
import type { ChatRole, IChatMessage } from '@/packages/persistence/types';

/* ── Validation helpers ──────────────────────────────────────────────────── */

const VALID_ROLES = new Set<ChatRole>(['user', 'assistant', 'system']);
const VALID_CHAT_PROFILES = new Set<ModelProfile>(['fast', 'reasoning', 'code']);
const DEFAULT_CHAT_PROFILE: ModelProfile = 'fast';

function isValidRole(value: unknown): value is ChatRole {
    return typeof value === 'string' && VALID_ROLES.has(value as ChatRole);
}

function isValidChatProfile(value: string | null): value is ModelProfile {
    return value !== null && VALID_CHAT_PROFILES.has(value as ModelProfile);
}

/**
 * Convert stored chat messages into the plain-text `role: content` context
 * string used by the model router.
 */
function buildConversationContext(messages: IChatMessage[]): string {
    return messages.map((message) => `${message.role}: ${message.content}`).join('\n');
}

/**
 * Map persisted chat messages to Ollama's chat message payload shape.
 */
function toOllamaMessages(messages: IChatMessage[]): IOllamaChatMessage[] {
    return messages.map((message) => ({
        role: message.role,
        content: message.content
    }));
}

/* ── Route registration ──────────────────────────────────────────────────── */

/**
 * Register all `/chat` routes on the Express application.
 *
 * @param app - The Express app instance.
 */
export function registerChatRoutes(app: express.Express): void {

    /* ── GET /chat/conversations ─────────────────────────────────────────── */

    app.get('/chat/conversations', async (req, res) => {
        const startedAt = new Date();
        logger.info('chat_list_conversations', { component: 'api.chat', requestId: req.requestId });

        const conversations = await listConversations();
        successResponse(res, { count: conversations.length, conversations }, 200, '', buildResponseMeta(startedAt, req));
    });

    /* ── POST /chat/conversations ────────────────────────────────────────── */

    app.post('/chat/conversations', async (req, res) => {
        const startedAt = new Date();
        const { title, profile } = req.body as { title?: unknown; profile?: unknown };

        if (title !== undefined && typeof title !== 'string') {
            rejectResponse(res, 400, 'Bad Request', ['title must be a string']);
            return;
        }
        if (profile !== undefined && profile !== null && typeof profile !== 'string') {
            rejectResponse(res, 400, 'Bad Request', ['profile must be a string or null']);
            return;
        }

        logger.info('chat_create_conversation', { component: 'api.chat', requestId: req.requestId });
        const conversation = await createConversation({
            title: typeof title === 'string' ? title : undefined,
            profile: typeof profile === 'string' ? profile : null
        });

        if (!conversation) {
            rejectResponse(res, 503, 'Service Unavailable', ['Database unavailable']);
            return;
        }
        successResponse(res, { conversation }, 201, '', buildResponseMeta(startedAt, req));
    });

    /* ── GET /chat/conversations/:id ─────────────────────────────────────── */

    app.get('/chat/conversations/:id', async (req, res) => {
        const startedAt = new Date();
        const { id } = req.params;

        logger.info('chat_get_conversation', { component: 'api.chat', id, requestId: req.requestId });
        const result = await getConversation(id);

        if (result === null) {
            rejectResponse(res, 503, 'Service Unavailable', ['Database unavailable']);
            return;
        }
        if (result === undefined) {
            rejectResponse(res, 404, 'Not Found', [`Conversation ${id} not found`]);
            return;
        }
        successResponse(res, { conversation: result }, 200, '', buildResponseMeta(startedAt, req));
    });

    /* ── PUT /chat/conversations/:id ─────────────────────────────────────── */

    app.put('/chat/conversations/:id', async (req, res) => {
        const startedAt = new Date();
        const { id } = req.params;
        const { title, profile } = req.body as { title?: unknown; profile?: unknown };

        if (title !== undefined && typeof title !== 'string') {
            rejectResponse(res, 400, 'Bad Request', ['title must be a string']);
            return;
        }
        if (profile !== undefined && profile !== null && typeof profile !== 'string') {
            rejectResponse(res, 400, 'Bad Request', ['profile must be a string or null']);
            return;
        }

        logger.info('chat_update_conversation', { component: 'api.chat', id, requestId: req.requestId });
        const result = await updateConversation(id, {
            title: typeof title === 'string' ? title : undefined,
            profile: profile !== undefined ? (profile as string | null) : undefined
        });

        if (result === null) {
            rejectResponse(res, 503, 'Service Unavailable', ['Database unavailable']);
            return;
        }
        if (result === undefined) {
            rejectResponse(res, 404, 'Not Found', [`Conversation ${id} not found`]);
            return;
        }
        successResponse(res, { conversation: result }, 200, '', buildResponseMeta(startedAt, req));
    });

    /* ── DELETE /chat/conversations/:id ──────────────────────────────────── */

    app.delete('/chat/conversations/:id', async (req, res) => {
        const startedAt = new Date();
        const { id } = req.params;

        logger.info('chat_delete_conversation', { component: 'api.chat', id, requestId: req.requestId });
        const deleted = await deleteConversation(id);

        if (deleted === null) {
            rejectResponse(res, 503, 'Service Unavailable', ['Database unavailable']);
            return;
        }
        if (!deleted) {
            rejectResponse(res, 404, 'Not Found', [`Conversation ${id} not found`]);
            return;
        }
        successResponse(res, { deleted: true }, 200, '', buildResponseMeta(startedAt, req));
    });

    /* ── POST /chat/conversations/:id/messages ───────────────────────────── */

    app.post('/chat/conversations/:id/messages', async (req, res) => {
        const startedAt = new Date();
        const { id } = req.params;
        const { role, content } = req.body as { role?: unknown; content?: unknown };

        if (!isValidRole(role)) {
            rejectResponse(res, 400, 'Bad Request', ['role must be one of: user, assistant, system']);
            return;
        }
        if (typeof content !== 'string' || content.trim() === '') {
            rejectResponse(res, 400, 'Bad Request', ['content is required and must be a non-empty string']);
            return;
        }

        const conversation = await getConversation(id);
        if (conversation === null) {
            rejectResponse(res, 503, 'Service Unavailable', ['Database unavailable']);
            return;
        }
        if (conversation === undefined) {
            rejectResponse(res, 404, 'Not Found', [`Conversation ${id} not found`]);
            return;
        }

        logger.info('chat_create_message', { component: 'api.chat', conversationId: id, requestId: req.requestId });
        const result = await createMessage(id, { role, content });

        if (result === null) {
            rejectResponse(res, 503, 'Service Unavailable', ['Database unavailable']);
            return;
        }
        if (result === undefined) {
            rejectResponse(res, 404, 'Not Found', [`Conversation ${id} not found`]);
            return;
        }

        if (role !== 'user') {
            successResponse(res, { message: result }, 201, '', buildResponseMeta(startedAt, req));
            return;
        }

        const profile = isValidChatProfile(conversation.profile) ? conversation.profile : DEFAULT_CHAT_PROFILE;
        const promptMessages = [...conversation.messages, result];
        let responseMessage = '';

        try {
            const route = await routeModel({
                task: result.content,
                context: buildConversationContext(promptMessages),
                step: 0,
                forcedProfile: profile
            });
            const llmResult = await chatWithMetadata(toOllamaMessages(promptMessages), {
                model: route.model,
                options: route.options
            });
            const assistantContent = llmResult.message.content.trim();

            if (assistantContent !== '') {
                const assistantMessage = await createMessage(id, {
                    role: 'assistant',
                    content: assistantContent
                });

                if (assistantMessage === null) {
                    responseMessage = 'Assistant reply unavailable';
                    logger.warn('chat_assistant_reply_persist_failed', {
                        component: 'api.chat',
                        conversationId: id,
                        requestId: req.requestId,
                        reason: 'database_unavailable'
                    });
                } else if (assistantMessage === undefined) {
                    responseMessage = 'Assistant reply unavailable';
                    logger.warn('chat_assistant_reply_persist_failed', {
                        component: 'api.chat',
                        conversationId: id,
                        requestId: req.requestId,
                        reason: 'unexpected_missing_conversation_after_reply_generation'
                    });
                }
            } else {
                responseMessage = 'Assistant reply unavailable';
                logger.warn('chat_assistant_reply_empty', {
                    component: 'api.chat',
                    conversationId: id,
                    requestId: req.requestId
                });
            }

            successResponse(res, { message: result }, 201, responseMessage, {
                ...buildResponseMeta(startedAt, req),
                model: route.model,
                profile: route.profile,
                promptTokens: llmResult.promptEvalCount,
                completionTokens: llmResult.evalCount,
                totalTokens: sumTokens(llmResult.promptEvalCount, llmResult.evalCount)
            });
            return;
        } catch (error) {
            responseMessage = 'Assistant reply unavailable';
            logger.error('chat_assistant_reply_failed', {
                component: 'api.chat',
                conversationId: id,
                requestId: req.requestId,
                error: String(error),
                errorName: error instanceof Error ? error.name : typeof error,
                errorMessage: error instanceof Error ? error.message : String(error)
            });
        }

        successResponse(res, { message: result }, 201, responseMessage, buildResponseMeta(startedAt, req));
    });

    /* ── PUT /chat/conversations/:id/messages/:msgId ─────────────────────── */

    app.put('/chat/conversations/:id/messages/:msgId', async (req, res) => {
        const startedAt = new Date();
        const { id, msgId } = req.params;
        const { content } = req.body as { content?: unknown };

        if (typeof content !== 'string' || content.trim() === '') {
            rejectResponse(res, 400, 'Bad Request', ['content is required and must be a non-empty string']);
            return;
        }

        logger.info('chat_update_message', { component: 'api.chat', conversationId: id, messageId: msgId, requestId: req.requestId });
        const result = await updateMessage(id, msgId, { content });

        if (result === null) {
            rejectResponse(res, 503, 'Service Unavailable', ['Database unavailable']);
            return;
        }
        if (result === undefined) {
            rejectResponse(res, 404, 'Not Found', [`Message ${msgId} not found in conversation ${id}`]);
            return;
        }
        successResponse(res, { message: result }, 200, '', buildResponseMeta(startedAt, req));
    });

    /* ── DELETE /chat/conversations/:id/messages/:msgId ──────────────────── */

    app.delete('/chat/conversations/:id/messages/:msgId', async (req, res) => {
        const startedAt = new Date();
        const { id, msgId } = req.params;

        logger.info('chat_delete_message', { component: 'api.chat', conversationId: id, messageId: msgId, requestId: req.requestId });
        const deleted = await deleteMessage(id, msgId);

        if (deleted === null) {
            rejectResponse(res, 503, 'Service Unavailable', ['Database unavailable']);
            return;
        }
        if (!deleted) {
            rejectResponse(res, 404, 'Not Found', [`Message ${msgId} not found in conversation ${id}`]);
            return;
        }
        successResponse(res, { deleted: true }, 200, '', buildResponseMeta(startedAt, req));
    });
}
