/**
 * SSE event bridge — translates in-process bus events into Server-Sent Events.
 *
 * ROLE: Single place that decides which internal agent/swarm events are
 * forwarded to connected SSE clients, and how each payload is shaped.
 * Keeps SSE formatting concerns out of the agent and orchestrator code.
 *
 * @module apps/api/sse-event-bridge
 */

import type { IAgentEvent } from "@/packages/events/bus";
import { SSE_PAYLOAD_MAX_LENGTH } from "@/packages/shared";

/** Callback injected by the endpoint that writes one SSE event to the HTTP response. */
type WriteEvent = (eventType: string, data: unknown) => void;

/** Optional context passed when an agent run belongs to a sequential workflow. */
interface IAgentSseOptions {
  /** Position of this agent step within a multi-step workflow (0-indexed). */
  workflowIndex?: number;
}

/**
 * Forward a single agent bus event to the SSE stream.
 *
 * Handles `agent:step`, `tool:result`, `tool:error`, `agent:model_routed`,
 * and `agent:hard_stop`. Truncates large payloads to `SSE_PAYLOAD_MAX_LENGTH`.
 *
 * @param event      - The internal event emitted by the agent.
 * @param writeEvent - SSE write callback provided by the endpoint.
 * @param options    - Optional workflow context for multi-step runs.
 * @returns `true` when the event was handled and forwarded, `false` when ignored.
 */
export function writeAgentEventToSse(
  event: IAgentEvent,
  writeEvent: WriteEvent,
  options: IAgentSseOptions = {},
): boolean {
  switch (event.type) {
    case "agent:step": {
      const p = event.payload as {
        step: number;
        parsed: { thought: string; action: string };
      };
      const payload = {
        step: p.step,
        action: p.parsed.action,
        thought: p.parsed.thought.slice(0, SSE_PAYLOAD_MAX_LENGTH),
      };
      if (typeof options.workflowIndex === "number") {
        writeEvent("step", { workflowIndex: options.workflowIndex, ...payload });
      } else {
        writeEvent("step", payload);
      }
      return true;
    }
    case "tool:result": {
      const p = event.payload as { tool: string; result: unknown };
      const payload = {
        tool: p.tool,
        result: JSON.stringify(p.result).slice(0, SSE_PAYLOAD_MAX_LENGTH),
      };
      if (typeof options.workflowIndex === "number") {
        writeEvent("tool", { workflowIndex: options.workflowIndex, ...payload });
      } else {
        writeEvent("tool", payload);
      }
      return true;
    }
    case "tool:error": {
      const p = event.payload as { tool: string; error: string };
      const payload = { tool: p.tool, error: p.error };
      if (typeof options.workflowIndex === "number") {
        writeEvent("tool", { workflowIndex: options.workflowIndex, ...payload });
      } else {
        writeEvent("tool", payload);
      }
      return true;
    }
    case "agent:model_routed": {
      const p = event.payload as {
        profile: string;
        model: string;
        reason: string;
      };
      const payload = {
        profile: p.profile,
        model: p.model,
        reason: p.reason,
      };
      if (typeof options.workflowIndex === "number") {
        writeEvent("route", { workflowIndex: options.workflowIndex, ...payload });
      } else {
        writeEvent("route", payload);
      }
      return true;
    }
    case "agent:hard_stop": {
      const p = event.payload as { step: number; code: string; reason: string };
      writeEvent("hard_stop", { step: p.step, code: p.code, reason: p.reason });
      return true;
    }
    default:
      return false;
  }
}

/**
 * Forward a single swarm bus event to the SSE stream.
 *
 * Handles swarm-specific events (`swarm:decomposed`, `swarm:subtask_start`,
 * `swarm:subtask_done`, `swarm:subtask_error`) and falls back to
 * `writeAgentEventToSse` for regular agent events.
 *
 * @param event      - The internal event emitted by the swarm/orchestrator.
 * @param writeEvent - SSE write callback provided by the endpoint.
 * @returns `true` when the event was handled and forwarded, `false` when ignored.
 */
export function writeSwarmEventToSse(event: IAgentEvent, writeEvent: WriteEvent): boolean {
  switch (event.type) {
    case "swarm:decomposed":
      writeEvent("decomposed", event.payload);
      return true;
    case "swarm:subtask_start":
      writeEvent("subtask_start", event.payload);
      return true;
    case "swarm:subtask_done":
      writeEvent("subtask_done", event.payload);
      return true;
    case "swarm:subtask_error":
      writeEvent("subtask_error", event.payload);
      return true;
    default:
      return writeAgentEventToSse(event, writeEvent);
  }
}
