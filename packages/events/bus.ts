/**
 * Minimal synchronous, in-process event bus.
 *
 * Decouples components from each other — any part of the system can
 * publish or subscribe to lifecycle events without importing the
 * publisher directly.  Supports both exact-type subscriptions and a
 * `"*"` wildcard for catch-all observers.
 *
 * Canonical event types emitted during an agent run:
 *   `agent:start`, `agent:step`, `agent:done`, `agent:error`,
 *   `agent:max_steps`, `agent:model_routed`,
 *   `tool:result`, `tool:error`
 *
 * Upgrade to an async / persistent bus (Redis Streams, BullMQ, etc.)
 * when durability or cross-process fan-out is needed.
 *
 * @module events/bus
 */

import { getLogger } from '../logger/logger';

/**
 * Shape of every event that flows through the bus.
 *
 * `type` is a dot-or-colon–separated string identifier (e.g. `"agent:step"`).
 * `payload` carries arbitrary data relevant to the event.
 */
export interface IAgentEvent {
    /** Dot- or colon-separated event identifier (e.g. `"agent:done"`). */
    type: string;

    /** Arbitrary data associated with the event. */
    payload: unknown;
}

/** Callback signature accepted by `on`. */
type EventHandler = (event: IAgentEvent) => void;

/** Internal registry: event type → ordered list of handlers. */
const handlers = new Map<string, EventHandler[]>();

const log = getLogger('events');

/**
 * Subscribe to events of a specific type.
 *
 * Pass `"*"` as the type to receive **every** event regardless of its
 * actual type — useful for logging and observability.
 *
 * @param type    - Event type to listen for, or `"*"` for all events.
 * @param handler - Callback invoked whenever a matching event is emitted.
 */
export function on(type: string, handler: EventHandler): void {
    const list = handlers.get(type) ?? [];
    list.push(handler);
    handlers.set(type, list);
}

/**
 * Unsubscribe a previously registered handler.
 *
 * The reference must be the **exact same function** passed to `on`.
 *
 * @param type    - Event type the handler was registered for.
 * @param handler - The handler function to remove.
 */
export function off(type: string, handler: EventHandler): void {
    const list = handlers.get(type);
    if (list) {
        handlers.set(
            type,
            list.filter((h) => h !== handler)
        );
    }
}

/**
 * Emit an event to all matching handlers **and** wildcard (`"*"`) handlers.
 *
 * Handler errors are caught and logged so that one faulty handler
 * cannot prevent the remaining handlers from executing.
 *
 * @param event - The event to broadcast.
 */
export function emit(event: IAgentEvent): void {
    const typed = handlers.get(event.type) ?? [];
    const wildcard = handlers.get('*') ?? [];

    for (const h of [...typed, ...wildcard]) {
        try {
            h(event);
        } catch (err) {
            log.error('event_handler_failed', {
                eventType: event.type,
                error: String(err)
            });
        }
    }
}
