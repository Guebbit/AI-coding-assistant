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
import { logger } from '@/packages/logger/logger';
import { rejectResponse, successResponse, buildResponseMeta } from '@/packages/shared';
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
import type { ChatRole } from '@/packages/persistence/types';

/* ── Validation helpers ──────────────────────────────────────────────────── */

const VALID_ROLES = new Set<ChatRole>(['user', 'assistant', 'system']);

function isValidRole(value: unknown): value is ChatRole {
    return typeof value === 'string' && VALID_ROLES.has(value as ChatRole);
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
        successResponse(res, { message: result }, 201, '', buildResponseMeta(startedAt, req));
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
