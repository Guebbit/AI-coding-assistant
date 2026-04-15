import type { IAgentEvent } from "../../packages/events/bus";
import { SSE_PAYLOAD_MAX_LENGTH } from "../../packages/shared";

type WriteEvent = (eventType: string, data: unknown) => void;

interface IAgentSseOptions {
  workflowIndex?: number;
}

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
    default:
      return false;
  }
}

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
