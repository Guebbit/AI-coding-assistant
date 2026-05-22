/**
 * Run endpoint — HTTP route for the core single-agent execution flow.
 *
 * Endpoint:
 * - `POST /run` — submit a task to the agent reasoning loop.
 *
 * @module apps/api/run-endpoints
 */

import type { Express, Request, Response } from "express";
import type { ModelProfile } from "@/packages/agent/model-router";
import { logger } from "@/packages/logger/logger";
import { rejectResponse, successResponse, t, validateProfile, validateTask } from "@/packages/shared";
import { createAgent, VALID_PROFILES } from "./agents";
import type { RunRequest, RunResponse } from "@/api";

/**
 * Register the core `POST /run` endpoint on the provided Express app.
 */
export function registerRunRoutes(app: Express): void {
  app.post("/run", (req: Request, res: Response) => {
    const { task: rawTask, allowWrite, profile } = req.body as Partial<RunRequest>;

    const taskResult = validateTask(rawTask);
    if ("error" in taskResult) {
      rejectResponse(res, 400, "Bad Request", [taskResult.error]);
      return;
    }
    const task = taskResult.task;

    const profileError = validateProfile(profile, VALID_PROFILES);
    if (profileError) {
      rejectResponse(res, 400, "Bad Request", [profileError]);
      return;
    }

    logger.info("run_request_received", {
      component: "api.run.endpoints",
      task,
      profile: profile ?? null,
      requestId: req.requestId,
    });

    const writeEnabled = allowWrite === true;
    const agent = createAgent(writeEnabled);

    agent
      .run(task, profile ? { profile: profile as ModelProfile } : undefined)
      .then((runResult) => {
        logger.info("run_request_completed", {
          component: "api.run.endpoints",
          taskLength: task.length,
          writeEnabled,
          profile: profile ?? null,
          requestId: req.requestId,
        });

        const response: RunResponse = {
          result: runResult.answer,
          citations: runResult.citations,
        };

        successResponse(res, response, 200, "", {
          ...runResult.meta,
          requestId: req.requestId,
        });
      })
      .catch((error: unknown) => {
        logger.error("run_request_failed", {
          component: "api.run.endpoints",
          error: String(error),
          requestId: req.requestId,
        });
        rejectResponse(res, 500, t("error.internal_server_error"), [String(error)]);
      });
  });
}
