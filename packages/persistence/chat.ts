/**
 * Chat persistence — conversation + message CRUD.
 *
 * WHY: Isolates chat-specific SQL from the rest of persistence (SRP).
 * All functions are fail-open via `withClient` from `./pool`.
 *
 * FLOW: conversations hold messages; each message belongs to one conversation.
 * Deleting a conversation cascades to its messages (FK constraint in DB).
 *
 * @module persistence/chat
 */

import { logger } from '../logger/logger';
import { withClient } from './pool';
import type {
    IConversation,
    IConversationWithMessages,
    IChatMessage,
    ICreateConversationInput,
    IUpdateConversationInput,
    ICreateMessageInput,
    IUpdateMessageInput
} from './types';

/* ── Column projections (DRY SQL aliases) ────────────────────────────────── */

/** Row-level projection helper for conversations. */
const CONVERSATION_COLS = `
    id, title, profile,
    created_at AS "createdAt",
    updated_at AS "updatedAt"`;

/** Row-level projection helper for chat messages. */
const MESSAGE_COLS = `
    id,
    conversation_id AS "conversationId",
    role, content,
    created_at AS "createdAt",
    updated_at AS "updatedAt"`;

/* ── Conversations ───────────────────────────────────────────────────────── */

/**
 * List all conversations (no messages), newest first.
 */
export async function listConversations(): Promise<IConversation[]> {
    const result = (await withClient((client) =>
        client.query<IConversation>(
            `SELECT ${CONVERSATION_COLS} FROM conversations ORDER BY created_at DESC`
        )
    )) as { rows: IConversation[] } | null;
    return result?.rows ?? [];
}

/**
 * Create a new conversation.
 */
export async function createConversation(
    input: ICreateConversationInput
): Promise<IConversation | null> {
    return withClient(async (client) => {
        const { rows } = await client.query<IConversation>(
            `INSERT INTO conversations (title, profile)
             VALUES ($1, $2)
             RETURNING ${CONVERSATION_COLS}`,
            [input.title?.trim() || 'New Conversation', input.profile ?? null]
        );
        const row = rows[0];
        logger.info('persistence_conversation_created', {
            component: 'persistence.db',
            id: row.id
        });
        return row;
    });
}

/**
 * Get a conversation and all its messages.
 * Returns `null` when DB is unavailable; returns `undefined` when not found.
 */
export async function getConversation(
    id: string
): Promise<IConversationWithMessages | null | undefined> {
    return withClient(async (client) => {
        const { rows: convRows } = await client.query<IConversation>(
            `SELECT ${CONVERSATION_COLS} FROM conversations WHERE id = $1`,
            [id]
        );
        if (convRows.length === 0) return undefined;

        const { rows: messageRows } = await client.query<IChatMessage>(
            `SELECT ${MESSAGE_COLS} FROM chat_messages
             WHERE conversation_id = $1
             ORDER BY created_at ASC`,
            [id]
        );
        return { ...convRows[0], messages: messageRows };
    });
}

/**
 * Update a conversation's title and/or profile.
 * Returns `null` when DB is unavailable; returns `undefined` when not found.
 */
export async function updateConversation(
    id: string,
    input: IUpdateConversationInput
): Promise<IConversation | null | undefined> {
    return withClient(async (client) => {
        const sets: string[] = [];
        const parameters: unknown[] = [id];

        if (input.title !== undefined) {
            parameters.push(input.title.trim() || 'New Conversation');
            sets.push(`title = $${parameters.length}`);
        }
        if (input.profile !== undefined) {
            parameters.push(input.profile);
            sets.push(`profile = $${parameters.length}`);
        }
        if (sets.length === 0) {
            const { rows } = await client.query<IConversation>(
                `SELECT ${CONVERSATION_COLS} FROM conversations WHERE id = $1`,
                [id]
            );
            return rows[0] ?? undefined;
        }

        sets.push(`updated_at = NOW()`);
        const { rows } = await client.query<IConversation>(
            `UPDATE conversations SET ${sets.join(', ')} WHERE id = $1
             RETURNING ${CONVERSATION_COLS}`,
            parameters
        );
        return rows[0] ?? undefined;
    });
}

/**
 * Delete a conversation and its messages (cascade handled by FK).
 * Returns `true` when deleted, `false` when not found, `null` on DB error.
 */
export async function deleteConversation(id: string): Promise<boolean | null> {
    return withClient(async (client) => {
        const { rowCount } = await client.query('DELETE FROM conversations WHERE id = $1', [id]);
        return (rowCount ?? 0) > 0;
    });
}

/* ── Messages ────────────────────────────────────────────────────────────── */

/**
 * Add a message to a conversation.
 * Returns `null` when DB is unavailable; returns `undefined` when conversation not found.
 */
export async function createMessage(
    conversationId: string,
    input: ICreateMessageInput
): Promise<IChatMessage | null | undefined> {
    return withClient(async (client) => {
        // Check the conversation exists before inserting
        const { rows: convCheck } = await client.query(
            'SELECT 1 FROM conversations WHERE id = $1',
            [conversationId]
        );
        if (convCheck.length === 0) return undefined;

        const { rows } = await client.query<IChatMessage>(
            `INSERT INTO chat_messages (conversation_id, role, content)
             VALUES ($1, $2, $3)
             RETURNING ${MESSAGE_COLS}`,
            [conversationId, input.role, input.content]
        );

        // Touch the conversation's updated_at timestamp
        await client.query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [
            conversationId
        ]);

        logger.info('persistence_message_created', {
            component: 'persistence.db',
            conversationId,
            id: rows[0].id
        });
        return rows[0];
    });
}

/**
 * Edit a message's content.
 * Returns `null` when DB is unavailable; returns `undefined` when not found.
 */
export async function updateMessage(
    conversationId: string,
    messageId: string,
    input: IUpdateMessageInput
): Promise<IChatMessage | null | undefined> {
    return withClient(async (client) => {
        const { rows } = await client.query<IChatMessage>(
            `UPDATE chat_messages
             SET content = $1, updated_at = NOW()
             WHERE id = $2 AND conversation_id = $3
             RETURNING ${MESSAGE_COLS}`,
            [input.content, messageId, conversationId]
        );
        if (rows.length === 0) return undefined;
        await client.query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [
            conversationId
        ]);
        return rows[0];
    });
}

/**
 * Delete a single message.
 * Returns `true` when deleted, `false` when not found, `null` on DB error.
 */
export async function deleteMessage(
    conversationId: string,
    messageId: string
): Promise<boolean | null> {
    return withClient(async (client) => {
        const { rowCount } = await client.query(
            'DELETE FROM chat_messages WHERE id = $1 AND conversation_id = $2',
            [messageId, conversationId]
        );
        return (rowCount ?? 0) > 0;
    });
}
