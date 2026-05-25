/**
 * Activity-log recorder helpers.
 *
 * @module apps/api/activity-log-recorder
 */

import type { IAgentEvent } from '@/packages/events/bus';
import { logger } from '@/packages/logger/logger';
import { appendActivityLog } from '@/packages/persistence/db';
import {
    normalizeApiActivityToActivityLog,
    normalizeBusEventToActivityLog,
    type IApiActivityInput
} from './activity-log-normalizer';

/**
 * Persist one event-bus event into the append-only activity log.
 */
export function recordBusActivityEvent(event: IAgentEvent): Promise<void> {
    const normalized = normalizeBusEventToActivityLog(event);
    return appendActivityLog(normalized)
        .then(() => undefined)
        .catch((error: unknown) => {
            logger.warn('activity_log_record_bus_event_failed', {
                component: 'api.activity_log',
                eventType: event.type,
                error: String(error)
            });
        });
}

/**
 * Persist one API lifecycle activity entry into the append-only activity log.
 */
export function recordApiActivity(input: IApiActivityInput): Promise<void> {
    const normalized = normalizeApiActivityToActivityLog(input);
    return appendActivityLog(normalized)
        .then(() => undefined)
        .catch((error: unknown) => {
            logger.warn('activity_log_record_api_event_failed', {
                component: 'api.activity_log',
                kind: input.kind,
                error: String(error)
            });
        });
}
