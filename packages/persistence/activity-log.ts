/**
 * MongoDB-backed append-only activity-log persistence.
 *
 * @module persistence/activity-log
 */

import {
    MongoClient,
    ObjectId,
    type Collection,
    type DeleteResult,
    type InsertOneResult
} from 'mongodb';
import { logger } from '../logger/logger';
import type {
    IActivityLogFilters,
    IActivityLogInput,
    IActivityLogQueryOptions,
    IActivityLogQueryResult,
    IActivityLogRecord
} from './types';

const DEFAULT_MONGO_URI = 'mongodb://localhost:27017';
const DEFAULT_COLLECTION = 'activity_log';
const DEFAULT_LIST_LIMIT = 100;
const MAX_LIST_LIMIT = 500;

let mongoClientPromise: Promise<MongoClient> | null = null;

interface IActivityLogAvailability {
    available: boolean;
    reason?: string;
}

interface IActivityLogDocument {
    _id?: ObjectId;
    timestamp: Date;
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
    data: Record<string, unknown>;
    meta?: Record<string, unknown>;
}

function isActivityLogEnabled(): boolean {
    return process.env.ACTIVITY_LOG_ENABLED === 'true';
}

function getMongoDatabaseName(): string {
    return process.env.MONGO_DATABASE?.trim() ?? '';
}

function getMongoUri(): string {
    return process.env.MONGO_URI?.trim() || DEFAULT_MONGO_URI;
}

function getActivityLogCollectionName(): string {
    return process.env.ACTIVITY_LOG_COLLECTION?.trim() || DEFAULT_COLLECTION;
}

/**
 * Report whether the persistent history store can currently serve API requests.
 */
export function getActivityLogAvailability(): IActivityLogAvailability {
    if (!isActivityLogEnabled()) {
        return {
            available: false,
            reason: 'Activity log persistence is disabled (set ACTIVITY_LOG_ENABLED=true to enable).'
        };
    }

    if (!getMongoDatabaseName()) {
        return {
            available: false,
            reason: 'Activity log persistence is enabled but MONGO_DATABASE is not configured.'
        };
    }

    return { available: true };
}

function getMongoClient(): Promise<MongoClient> {
    if (!mongoClientPromise) {
        const client = new MongoClient(getMongoUri());
        mongoClientPromise = client
            .connect()
            .then(() => client)
            .catch((error: unknown) => {
                mongoClientPromise = null;
                throw error;
            });
    }
    return mongoClientPromise;
}

function withCollection<T>(
    executor: (collection: Collection<IActivityLogDocument>) => Promise<T>
): Promise<T | null> {
    const availability = getActivityLogAvailability();
    if (!availability.available) return Promise.resolve(null);

    return getMongoClient()
        .then((client) =>
            executor(
                client
                    .db(getMongoDatabaseName())
                    .collection<IActivityLogDocument>(getActivityLogCollectionName())
            )
        )
        .catch((error: unknown) => {
            logger.warn('persistence_activity_log_error', {
                component: 'persistence.activity_log',
                error: String(error)
            });
            return null;
        });
}

function normalizeLimit(rawLimit?: number): number {
    if (typeof rawLimit !== 'number' || !Number.isFinite(rawLimit) || rawLimit <= 0) {
        return DEFAULT_LIST_LIMIT;
    }
    return Math.min(Math.floor(rawLimit), MAX_LIST_LIMIT);
}

function toActivityLogRecord(document: IActivityLogDocument): IActivityLogRecord {
    const id = document._id?.toString();
    if (!id) throw new Error('Activity log document missing _id');
    return {
        id,
        timestamp: document.timestamp,
        kind: document.kind,
        category: document.category,
        type: document.type,
        ...(document.conversationId ? { conversationId: document.conversationId } : {}),
        ...(document.messageId ? { messageId: document.messageId } : {}),
        ...(document.requestId ? { requestId: document.requestId } : {}),
        ...(document.runId ? { runId: document.runId } : {}),
        ...(document.workflowId ? { workflowId: document.workflowId } : {}),
        ...(document.subtaskId ? { subtaskId: document.subtaskId } : {}),
        ...(document.parentId ? { parentId: document.parentId } : {}),
        ...(document.profile ? { profile: document.profile } : {}),
        ...(document.toolName ? { toolName: document.toolName } : {}),
        ...(document.status ? { status: document.status } : {}),
        data: document.data,
        ...(document.meta ? { meta: document.meta } : {})
    };
}

function buildFilters(filters: IActivityLogFilters): Record<string, unknown> {
    return Object.entries(filters).reduce<Record<string, unknown>>((accumulator, [key, value]) => {
        if (typeof value === 'string' && value.trim() !== '') {
            accumulator[key] = value.trim();
        }
        return accumulator;
    }, {});
}

function parseCursor(since?: string): ObjectId | undefined {
    if (!since) return undefined;
    if (!ObjectId.isValid(since)) {
        throw new Error('Invalid "since" cursor. Expected a Mongo ObjectId string.');
    }
    return new ObjectId(since);
}

/**
 * Append one activity entry to the persistent MongoDB history log.
 */
export function appendActivityLog(input: IActivityLogInput): Promise<string | null> {
    const document: Omit<IActivityLogDocument, '_id'> = {
        timestamp: input.timestamp ?? new Date(),
        kind: input.kind,
        category: input.category,
        type: input.type,
        ...(input.conversationId ? { conversationId: input.conversationId } : {}),
        ...(input.messageId ? { messageId: input.messageId } : {}),
        ...(input.requestId ? { requestId: input.requestId } : {}),
        ...(input.runId ? { runId: input.runId } : {}),
        ...(input.workflowId ? { workflowId: input.workflowId } : {}),
        ...(input.subtaskId ? { subtaskId: input.subtaskId } : {}),
        ...(input.parentId ? { parentId: input.parentId } : {}),
        ...(input.profile ? { profile: input.profile } : {}),
        ...(input.toolName ? { toolName: input.toolName } : {}),
        ...(input.status ? { status: input.status } : {}),
        data: input.data,
        ...(input.meta ? { meta: input.meta } : {})
    };

    return withCollection((collection) =>
        collection
            .insertOne(document)
            .then((result: InsertOneResult<IActivityLogDocument>) => result.insertedId.toString())
    );
}

/**
 * Incrementally list activity-log entries ordered by cursor (`_id`) ascending.
 */
export function listActivityLog(
    options: IActivityLogQueryOptions = {}
): Promise<IActivityLogQueryResult> {
    const limit = normalizeLimit(options.limit);

    return Promise.resolve()
        .then(() => {
            const cursor = parseCursor(options.since);
            const filters = buildFilters(options);
            const query = cursor !== undefined ? { ...filters, _id: { $gt: cursor } } : filters;
            return withCollection((collection) =>
                collection
                    .find(query)
                    .sort({ _id: 1 })
                    .limit(limit + 1)
                    .toArray()
            ).then((documents) => (documents ?? []) as IActivityLogDocument[]);
        })
        .then((documents) => {
            const hasMore = documents.length > limit;
            const sliced = hasMore ? documents.slice(0, limit) : documents;
            const entries = sliced.map(toActivityLogRecord);
            const nextCursor = entries.length > 0 ? entries[entries.length - 1].id : options.since;
            return {
                entries,
                ...(nextCursor ? { nextCursor } : {}),
                hasMore
            };
        });
}

/**
 * Export activity-log entries in ascending cursor order.
 */
export function exportActivityLog(
    options: IActivityLogQueryOptions = {}
): Promise<IActivityLogRecord[]> {
    const limit =
        typeof options.limit === 'number' && Number.isFinite(options.limit) && options.limit > 0
            ? Math.min(Math.floor(options.limit), 20_000)
            : undefined;

    return Promise.resolve()
        .then(() => {
            const cursor = parseCursor(options.since);
            const filters = buildFilters(options);
            const query = cursor !== undefined ? { ...filters, _id: { $gt: cursor } } : filters;
            return withCollection((collection) => {
                const findCursor = collection.find(query).sort({ _id: 1 });
                if (typeof limit === 'number') findCursor.limit(limit);
                return findCursor.toArray();
            }).then((documents) => (documents ?? []) as IActivityLogDocument[]);
        })
        .then((documents) => documents.map(toActivityLogRecord));
}

/**
 * Delete all activity-log entries, or only the entries matching filters.
 */
export function clearActivityLog(filters: IActivityLogFilters = {}): Promise<number | null> {
    const query = buildFilters(filters);
    return withCollection((collection) =>
        collection.deleteMany(query).then((result: DeleteResult) => result.deletedCount)
    );
}
