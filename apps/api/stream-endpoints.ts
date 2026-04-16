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
import { on, off } from "@/packages/events/bus";
import type { IAgentEvent } from "@/packages/events/bus";
import { logger } from "@/packages/logger/logger";
import {
  rejectResponse,
  validateTask,
  validateProfile,
  createSseWriter,
  setupSSEHeaders,
  onSSEClose,
} from "@/packages/shared";
import { createAgent, VALID_PROFILES } from "./agents";
import type { ModelProfile } from "@/packages/agent/model-router";
import type { RunRequest } from "@/api/models";
import { writeAgentEventToSse } from "./sse-event-bridge";

/**
 * Register the `POST /run/stream` endpoint on the given Express app.
 *
 * @param app - The Express application to attach the route to.
 * @returns Nothing.
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
    const { task: rawTask, allowWrite, profile } = req.body as Partial<RunRequest>;

    const taskResult = validateTask(rawTask);
    if ('error' in taskResult) {
      rejectResponse(res, 400, "Bad Request", [taskResult.error]);
      return;
    }
    const task = taskResult.task;

    const profileError = validateProfile(profile, VALID_PROFILES);
    if (profileError) {
      rejectResponse(res, 400, "Bad Request", [profileError]);
      return;
    }

    /* ── Set SSE headers ──────────────────────────────────────────── */
    setupSSEHeaders(res);

    const writeEvent = createSseWriter(res);

    /* ── Event bridge ─────────────────────────────────────────────── */
    const handler = (event: IAgentEvent): void => {
      try {
        writeAgentEventToSse(event, writeEvent);
      } catch (error) {
        logger.warn("stream_event_write_failed", { component: "api.stream.endpoints", error: String(error) });
      }
    };

    on("*", handler);

    /* ── Run the agent ────────────────────────────────────────────── */
    const writeEnabled = allowWrite === true;
    const agent = createAgent(writeEnabled);

    logger.info("stream_run_started", {
      component: "api.stream.endpoints",
      task,
      writeEnabled,
      profile: profile ?? null,
    });

    agent
      .run(task, profile ? { profile: profile as ModelProfile } : undefined)
      .then((runResult) => {
        writeEvent("done", {
          result: runResult.answer,
          meta: {
            ...runResult.meta,
            requestId: req.requestId,
          },
        });
        logger.info("stream_run_completed", { component: "api.stream.endpoints", taskLength: task.length });
      })
      .catch((error: unknown) => {
        writeEvent("error", { error: String(error) });
        logger.error("stream_run_failed", { component: "api.stream.endpoints", error: String(error) });
      })
      .finally(() => {
        off("*", handler);
        res.end();
      });

    /* Clean up handler when the client disconnects early. */
    onSSEClose(req, () => off("*", handler));
  });
}
