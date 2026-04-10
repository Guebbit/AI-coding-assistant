/**
 * Minimal synchronous event bus.
 *
 * Lets decoupled components react to agent lifecycle events without
 * tight coupling.  Supports typed subscriptions and a "*" wildcard.
 *
 * Example events:
 *   agent:start, agent:step, agent:done, agent:error, agent:max_steps
 *   tool:result, tool:error
 *   file_changed, email_received, cron_tick   (phase 4 stubs)
 *
 * Upgrade to an async / persistent bus (Redis Streams, BullMQ, etc.)
 * when you need durability or cross-process fan-out.
 */

export interface AgentEvent {
  type: string;
  payload: unknown;
}

type EventHandler = (event: AgentEvent) => void;

const handlers = new Map<string, EventHandler[]>();

/**
 * Subscribe to a specific event type.
 * Use "*" to receive every event regardless of type.
 */
export function on(type: string, handler: EventHandler): void {
  const list = handlers.get(type) ?? [];
  list.push(handler);
  handlers.set(type, list);
}

/** Remove a previously registered handler. */
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
 * Emit an event to all matching handlers AND wildcard ("*") handlers.
 * Handler errors are caught and logged so one bad handler cannot block others.
 */
export function emit(event: AgentEvent): void {
  const typed = handlers.get(event.type) ?? [];
  const wildcard = handlers.get("*") ?? [];

  [...typed, ...wildcard].forEach((h) => {
    try {
      h(event);
    } catch (err) {
      console.error(`[bus] Error in handler for "${event.type}":`, err);
    }
  });
}
