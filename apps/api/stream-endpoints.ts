/**
 * SSE streaming endpoint — exposes the agent's event bus over
 * Server-Sent Events so clients receive live step-by-step updates.
 *
 * New endpoint: `POST /run/stream`
 * Same request body as `POST /run` (`{ task, allowWrite?, profile? }`).
 *
 * SSE event types emitted:
 * - `step`      — on `agent:step`          — `{ step, action, thought }`
 * - `tool`      — on `tool:result`/`tool:error` — `{ tool, result?, error? }`
 * - `route`     — on `agent:model_routed`  — `{ profile, model, reason }`
 * - `done`      — on `agent:done`          — `{ result }`
 * - `error`     — on `agent:error`         — `{ error }`
 * - `max_steps` — on `agent:max_steps`     — `{ task, summary }`
 *
 * The original `POST /run` endpoint remains completely unchanged.
 *
 * @module apps/api/stream-endpoints
 */

import type { Express, Request, Response } from "express";
import { on, off } from "../../packages/events/bus";
import type { IAgentEvent } from "../../packages/events/bus";
import { getLogger } from "../../packages/logger/logger";
import { rejectResponse } from "../../packages/shared";
import { createAgent, VALID_PROFILES } from "./agents";
import type { ModelProfile } from "../../packages/agent/model-router";
import type { RunRequest } from "../../api/models";

const log = getLogger("stream-endpoints");

/** Maximum characters to include in SSE event data payloads. */
const SSE_PAYLOAD_MAX_LENGTH = 300;

/**
 * Serialise an event as an SSE frame.
 *
 * @param eventType - The SSE event name.
 * @param data      - JSON-serialisable payload.
 * @returns A formatted SSE string ready to write to the response.
 */
function sseFrame(eventType: string, data: unknown): string {
  return `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Register the `POST /run/stream` endpoint on the given Express app.
 *
 * @param app - The Express application to attach the route to.
 */
export function registerStreamRoutes(app: Express): void {
  /**
   * POST /run/stream — run the agent and stream events as SSE.
   *
   * Request body: `{ task: string, allowWrite?: boolean, profile?: string }`
   *
   * The response keeps the connection open until the agent completes.
   * Each significant lifecycle event is forwarded as a typed SSE event.
   */
  app.post("/run/stream", (req: Request, res: Response) => {
    const { task, allowWrite, profile } = req.body as Partial<RunRequest>;

    if (!task || typeof task !== "string" || task.trim() === "") {
      rejectResponse(
        res,
        400,
        "Bad Request",
        ['"task" (non-empty string) is required in the request body'],
      );
      return;
    }

    if (profile !== undefined && !VALID_PROFILES.has(profile as ModelProfile)) {
      rejectResponse(res, 400, "Bad Request", [`"profile" must be one of: ${[...VALID_PROFILES].join(", ")}`]);
      return;
    }

    /* ── Set SSE headers ──────────────────────────────────────────── */
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const writeEvent = (eventType: string, data: unknown): void => {
      res.write(sseFrame(eventType, data));
    };

    /* ── Event bridge ─────────────────────────────────────────────── */
    const handler = (event: IAgentEvent): void => {
      try {
        switch (event.type) {
          case "agent:step": {
            const p = event.payload as {
              step: number;
              parsed: { thought: string; action: string };
            };
            writeEvent("step", {
              step: p.step,
              action: p.parsed.action,
              thought: p.parsed.thought.slice(0, SSE_PAYLOAD_MAX_LENGTH),
            });
            break;
          }
          case "tool:result": {
            const p = event.payload as { tool: string; result: unknown };
            writeEvent("tool", {
              tool: p.tool,
              result: JSON.stringify(p.result).slice(0, SSE_PAYLOAD_MAX_LENGTH),
            });
            break;
          }
          case "tool:error": {
            const p = event.payload as { tool: string; error: string };
            writeEvent("tool", { tool: p.tool, error: p.error });
            break;
          }
          case "agent:model_routed": {
            const p = event.payload as {
              profile: string;
              model: string;
              reason: string;
            };
            writeEvent("route", {
              profile: p.profile,
              model: p.model,
              reason: p.reason,
            });
            break;
          }
          default:
            /* Unhandled events are silently ignored. */
            break;
        }
      } catch (error) {
        log.warn("stream_event_write_failed", { error: String(error) });
      }
    };

    on("*", handler);

    /* ── Run the agent ────────────────────────────────────────────── */
    const writeEnabled = allowWrite === true;
    const agent = createAgent(writeEnabled);

    log.info("stream_run_started", {
      task,
      writeEnabled,
      profile: profile ?? null,
    });

    agent
      .run(task.trim(), profile ? { profile: profile as ModelProfile } : undefined)
      .then((result) => {
        writeEvent("done", { result });
        log.info("stream_run_completed", { taskLength: task.length });
      })
      .catch((error: unknown) => {
        writeEvent("error", { error: String(error) });
        log.error("stream_run_failed", { error: String(error) });
      })
      .finally(() => {
        off("*", handler);
        res.end();
      });

    /* Clean up handler when the client disconnects early. */
    req.on("close", () => {
      off("*", handler);
    });
  });
}
