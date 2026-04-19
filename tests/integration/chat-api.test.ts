/**
 * Integration tests for apps/api/chat-endpoints.ts
 *
 * Verifies that posting a user message persists the message, calls Ollama
 * with the fast profile by default, and stores the assistant reply.
 */

import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
    process.env.AGENT_MODEL_FAST = 'fast-model';
    process.env.OLLAMA_BASE_URL = 'http://ollama.test';
});

type ChatRole = 'user' | 'assistant' | 'system';

interface IStoredMessage {
    id: string;
    conversationId: string;
    role: ChatRole;
    content: string;
    createdAt: Date;
    updatedAt: Date;
}

interface IStoredConversation {
    id: string;
    title: string;
    profile: string | null;
    createdAt: Date;
    updatedAt: Date;
    messages: IStoredMessage[];
}

const persistenceState = vi.hoisted(() => ({
    conversations: new Map<string, IStoredConversation>(),
    conversationCounter: 0,
    messageCounter: 0,
    timestampCounter: 0
}));

function nextTimestamp(): Date {
    persistenceState.timestampCounter += 1;
    return new Date(Date.UTC(2026, 0, 1, 0, 0, persistenceState.timestampCounter));
}

function cloneMessage(message: IStoredMessage): IStoredMessage {
    return {
        ...message,
        createdAt: new Date(message.createdAt),
        updatedAt: new Date(message.updatedAt)
    };
}

function cloneConversation(conversation: IStoredConversation): IStoredConversation {
    return {
        ...conversation,
        createdAt: new Date(conversation.createdAt),
        updatedAt: new Date(conversation.updatedAt),
        messages: conversation.messages.map(cloneMessage)
    };
}

vi.mock('@/packages/logger/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

vi.mock('@/packages/persistence/db', () => ({
    listConversations: vi.fn(async () =>
        [...persistenceState.conversations.values()].map((conversation) => {
            const { messages, ...withoutMessages } = cloneConversation(conversation);
            return withoutMessages;
        })
    ),
    createConversation: vi.fn(async (input?: { title?: string; profile?: string | null }) => {
        const now = nextTimestamp();
        persistenceState.conversationCounter += 1;
        const conversation: IStoredConversation = {
            id: `conversation-${persistenceState.conversationCounter}`,
            title: input?.title?.trim() || 'New Conversation',
            profile: input?.profile ?? null,
            createdAt: now,
            updatedAt: now,
            messages: []
        };
        persistenceState.conversations.set(conversation.id, conversation);
        return cloneConversation(conversation);
    }),
    getConversation: vi.fn(async (id: string) => {
        const conversation = persistenceState.conversations.get(id);
        return conversation ? cloneConversation(conversation) : undefined;
    }),
    updateConversation: vi.fn(
        async (id: string, input: { title?: string; profile?: string | null }) => {
            const conversation = persistenceState.conversations.get(id);
            if (!conversation) return undefined;
            if (input.title !== undefined)
                conversation.title = input.title.trim() || 'New Conversation';
            if (input.profile !== undefined) conversation.profile = input.profile;
            conversation.updatedAt = nextTimestamp();
            return cloneConversation(conversation);
        }
    ),
    deleteConversation: vi.fn(async (id: string) => persistenceState.conversations.delete(id)),
    createMessage: vi.fn(
        async (conversationId: string, input: { role: ChatRole; content: string }) => {
            const conversation = persistenceState.conversations.get(conversationId);
            if (!conversation) return undefined;
            const now = nextTimestamp();
            persistenceState.messageCounter += 1;
            const message: IStoredMessage = {
                id: `message-${persistenceState.messageCounter}`,
                conversationId,
                role: input.role,
                content: input.content,
                createdAt: now,
                updatedAt: now
            };
            conversation.messages.push(message);
            conversation.updatedAt = now;
            return cloneMessage(message);
        }
    ),
    updateMessage: vi.fn(
        async (conversationId: string, messageId: string, input: { content: string }) => {
            const conversation = persistenceState.conversations.get(conversationId);
            const message = conversation?.messages.find((entry) => entry.id === messageId);
            if (!message) return undefined;
            message.content = input.content;
            message.updatedAt = nextTimestamp();
            return cloneMessage(message);
        }
    ),
    deleteMessage: vi.fn(async (conversationId: string, messageId: string) => {
        const conversation = persistenceState.conversations.get(conversationId);
        if (!conversation) return false;
        const before = conversation.messages.length;
        conversation.messages = conversation.messages.filter((message) => message.id !== messageId);
        return conversation.messages.length !== before;
    })
}));

import { registerChatRoutes } from '@/apps/api/chat-endpoints';

const realFetch = globalThis.fetch;

const mockFetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (!url.toString().startsWith('http://ollama.test/')) {
        return realFetch(url, init);
    }

    expect(url.toString()).toBe('http://ollama.test/api/chat');
    const body = JSON.parse(init?.body as string) as {
        model: string;
        messages: Array<{ role: ChatRole; content: string }>;
    };

    expect(body.model).toBe('fast-model');
    expect(body.messages).toMatchObject([{ role: 'user', content: 'Hello, how are you?' }]);

    const responseBody = {
        message: { role: 'assistant', content: 'Hi! I am doing well.' },
        model: 'fast-model',
        done: true,
        prompt_eval_count: 12,
        eval_count: 5
    };

    return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(responseBody),
        json: async () => responseBody
    } satisfies Partial<Response>;
});

async function startServer(): Promise<{ server: Server; baseUrl: string }> {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        req.requestId = 'test-request-id';
        next();
    });
    registerChatRoutes(app);

    const server = await new Promise<Server>((resolve) => {
        const instance = app.listen(0, () => resolve(instance));
    });

    return {
        server,
        baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    };
}

describe('chat API', () => {
    beforeEach(() => {
        persistenceState.conversations.clear();
        persistenceState.conversationCounter = 0;
        persistenceState.messageCounter = 0;
        persistenceState.timestampCounter = 0;
        vi.stubGlobal('fetch', mockFetch);
        mockFetch.mockClear();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('creates an assistant reply for user messages with the fast profile', async () => {
        const { server, baseUrl } = await startServer();

        try {
            const createConversationResponse = await fetch(`${baseUrl}/chat/conversations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            const createConversationBody = (await createConversationResponse.json()) as {
                data: { conversation: { id: string } };
            };

            const postMessageResponse = await fetch(
                `${baseUrl}/chat/conversations/${createConversationBody.data.conversation.id}/messages`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ role: 'user', content: 'Hello, how are you?' })
                }
            );
            const postMessageBody = (await postMessageResponse.json()) as {
                success: boolean;
                data: { message: { role: string; content: string } };
                meta: { model?: string; profile?: string; totalTokens?: number };
            };

            expect(postMessageResponse.status).toBe(201);
            expect(postMessageBody.success).toBe(true);
            expect(postMessageBody.data.message).toMatchObject({
                role: 'user',
                content: 'Hello, how are you?'
            });
            expect(postMessageBody.meta).toMatchObject({
                model: 'fast-model',
                profile: 'fast',
                totalTokens: 17
            });

            const getConversationResponse = await fetch(
                `${baseUrl}/chat/conversations/${createConversationBody.data.conversation.id}`
            );
            const getConversationBody = (await getConversationResponse.json()) as {
                data: {
                    conversation: {
                        messages: Array<{ role: string; content: string }>;
                    };
                };
            };

            expect(getConversationResponse.status).toBe(200);
            expect(getConversationBody.data.conversation.messages).toMatchObject([
                { role: 'user', content: 'Hello, how are you?' },
                { role: 'assistant', content: 'Hi! I am doing well.' }
            ]);
            const ollamaCalls = mockFetch.mock.calls.filter(([url]) =>
                url.toString().startsWith('http://ollama.test/')
            );
            expect(ollamaCalls).toHaveLength(1);
        } finally {
            await new Promise<void>((resolve, reject) => {
                server.close((error) => (error ? reject(error) : resolve()));
            });
        }
    });
});
