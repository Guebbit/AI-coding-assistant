/**
 * Swarm endpoints — HTTP routes for multi-agent task orchestration.
 *
 * Endpoints:
 * - `POST /run/swarm`        — run a swarm and return the final result.
 * - `POST /run/swarm/stream` — run a swarm and stream events as SSE.
 *
 * These endpoints decompose a complex task into subtasks, delegate each
 * to a specialised agent, and synthesise a final answer.
 *
 * @module apps/api/swarm-endpoints
 */

import type { Express, Request, Response } from "express";
import { on, off } from "../../packages/events/bus";
import type { IAgentEvent } from "../../packages/events/bus";
import { getLogger } from "../../packages/logger/logger";
import { rejectResponse, successResponse } from "../../packages/shared";
import { createSwarmOrchestrator, VALID_PROFILES } from "./agents";
import type { ModelProfile } from "../../packages/agent/model-router";
import type { ISwarmConfig } from "../../packages/swarm/types";
import type { SwarmRequest, SwarmResponse } from "../../api/models";

const log = getLogger("swarm-endpoints");

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
 * Parse and validate the shared request body fields for swarm endpoints.
 *
 * @param body - The raw request body.
 * @returns Validated fields, or an `error` string if validation fails.
 */
function parseSwarmBody(body: Partial<SwarmRequest>): {
  task?: string;
  config?: ISwarmConfig;
  error?: string;
} {
  const task = body.task;

  if (!task || typeof task !== "string" || task.trim() === "") {
    return { error: '"task" (non-empty string) is required in the request body' };
  }

  const profile = body.profile;
  if (profile !== undefined && !VALID_PROFILES.has(profile as ModelProfile)) {
    return {
      error: `"profile" must be one of: ${[...VALID_PROFILES].join(", ")}`,
    };
  }

  const maxSubtasks = body.maxSubtasks;
  if (maxSubtasks !== undefined && (typeof maxSubtasks !== "number" || maxSubtasks < 1)) {
    return { error: '"maxSubtasks" must be a positive number' };
  }

  const config: ISwarmConfig = {
    allowWrite: body.allowWrite === true,
    maxSubtasks: maxSubtasks ?? 6,
    profileOverride: profile as ModelProfile | undefined,
  };

  return { task: task.trim(), config };
}

/**
 * Register swarm-related HTTP routes on the given Express app.
 *
 * @param app - The Express application to attach routes to.
 */
export function registerSwarmRoutes(app: Express): void {
  /**
   * POST /run/swarm — run a multi-agent swarm and return the final result.
   *
   * Request body:
   * ```json
   * {
   *   "task": "Build a React app with auth, tests, and docs",
   *   "allowWrite": false,
   *   "profile": "code",
   *   "maxSubtasks": 4
   * }
   * ```
   *
   * Response: `{ "result": "...", "subtaskResults": [...], "totalDurationMs": 12345 }`
   */
  app.post("/run/swarm", (req: Request, res: Response) => {
    const { task, config, error } = parseSwarmBody(
      req.body as Partial<SwarmRequest>,
    );

    if (error || !task || !config) {
      rejectResponse(res, 400, "Bad Request", [error ?? "Invalid swarm request"]);
      return;
    }

    log.info("swarm_request_received", {
      task,
      maxSubtasks: config.maxSubtasks,
      allowWrite: config.allowWrite,
      profile: config.profileOverride ?? null,
      requestId: req.requestId,
    });

    const orchestrator = createSwarmOrchestrator(config.allowWrite ?? false);
    orchestrator
      .run(task, config)
      .then((result) => {
        log.info("swarm_request_completed", {
          taskLength: task.length,
          subtaskCount: result.subtaskResults.length,
          totalDurationMs: result.totalDurationMs,
          requestId: req.requestId,
        });

        const response: SwarmResponse = {
          answer: result.answer,
          result: result.answer,
          subtaskResults: result.subtaskResults.map((r) => ({
            id: r.subtask.id,
            description: r.subtask.description,
            profile: r.subtask.profile,
            success: r.success,
            answer: r.answer,
            durationMs: r.durationMs,
            error: r.error,
          })),
          decomposition: {
            reasoning: result.decomposition.reasoning,
            subtaskCount: result.decomposition.subtasks.length,
          },
          totalDurationMs: result.totalDurationMs,
        };

        successResponse(res, response);
      })
      .catch((reason: unknown) => {
        log.error("swarm_request_failed", { error: String(reason), requestId: req.requestId });
        rejectResponse(res, 500, "Internal Server Error", [String(reason)]);
      });
  });

  /**
   * POST /run/swarm/stream — run a swarm and stream events as SSE.
   *
   * Same request body as `POST /run/swarm`.
   *
   * SSE events:
   * - `decomposed`     — the decomposition plan
   * - `subtask_start`  — a subtask agent is starting
   * - `subtask_done`   — a subtask agent completed
   * - `subtask_error`  — a subtask agent failed
   * - `step`           — an inner agent step (from the event bus)
   * - `tool`           — a tool result/error (from the event bus)
   * - `route`          — a model routing decision (from the event bus)
   * - `done`           — the swarm finished with a final answer
   * - `error`          — the swarm run failed
   */
  app.post("/run/swarm/stream", (req: Request, res: Response) => {
    const { task, config, error } = parseSwarmBody(
      req.body as Partial<SwarmRequest>,
    );

    if (error || !task || !config) {
      rejectResponse(res, 400, "Bad Request", [error ?? "Invalid swarm request"]);
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

    /* ── Event bridge (swarm + agent events) ──────────────────────── */
    const handler = (event: IAgentEvent): void => {
      try {
        switch (event.type) {
          case "swarm:decomposed": {
            writeEvent("decomposed", event.payload);
            break;
          }
          case "swarm:subtask_start": {
            writeEvent("subtask_start", event.payload);
            break;
          }
          case "swarm:subtask_done": {
            writeEvent("subtask_done", event.payload);
            break;
          }
          case "swarm:subtask_error": {
            writeEvent("subtask_error", event.payload);
            break;
          }
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
            break;
        }
      } catch (error) {
        log.warn("swarm_stream_event_write_failed", { error: String(error) });
      }
    };

    on("*", handler);

    /* ── Run the swarm ────────────────────────────────────────────── */
    log.info("swarm_stream_started", {
      task,
      maxSubtasks: config.maxSubtasks,
      allowWrite: config.allowWrite,
      profile: config.profileOverride ?? null,
    });

    const orchestrator = createSwarmOrchestrator(config.allowWrite ?? false);

    orchestrator
      .run(task, config)
      .then((result) => {
        writeEvent("done", {
          result: result.answer,
          totalDurationMs: result.totalDurationMs,
          subtaskCount: result.subtaskResults.length,
        });
        log.info("swarm_stream_completed", { taskLength: task.length });
      })
      .catch((error: unknown) => {
        writeEvent("error", { error: String(error) });
        log.error("swarm_stream_failed", { error: String(error) });
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
