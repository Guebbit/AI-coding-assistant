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
import {
  rejectResponse,
  successResponse,
  t,
  validateProfile,
  validateTask,
  validateToolPolicy,
} from "@/packages/shared";
import { createAgent, VALID_PROFILES } from "./agents";
import type { RunRequest, RunResponse } from "@/api";
import { recordApiActivity } from "./activity-log-recorder";

/**
 * Register the core `POST /run` endpoint on the provided Express app.
 */
export function registerRunRoutes(app: Express): void {
  app.post("/run", (req: Request, res: Response) => {
    const { task: rawTask, allowWrite, profile, toolPolicy } = req.body as Partial<RunRequest>;

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

    const toolPolicyResult = validateToolPolicy(toolPolicy);
    if (toolPolicyResult.error) {
      rejectResponse(res, 400, "Bad Request", [toolPolicyResult.error]);
      return;
    }

    logger.info("run_request_received", {
      component: "api.run.endpoints",
      task,
      profile: profile ?? null,
      toolPolicyMode: toolPolicyResult.toolPolicy?.mode ?? null,
      requestId: req.requestId,
    });
    recordApiActivity({
      kind: "api:run_requested",
      requestId: req.requestId,
      profile: profile ?? undefined,
      data: {
        task,
        allowWrite: allowWrite === true,
        toolPolicyMode: toolPolicyResult.toolPolicy?.mode ?? null,
      },
    }).catch(() => undefined);

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
        recordApiActivity({
          kind: "api:run_completed",
          requestId: req.requestId,
          status: "completed",
          profile: profile ?? undefined,
          data: {
            answerLength: runResult.answer.length,
            citationsCount: runResult.citations.length,
          },
          meta: runResult.meta as unknown as Record<string, unknown>,
        }).catch(() => undefined);

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
        recordApiActivity({
          kind: "api:run_failed",
          requestId: req.requestId,
          status: "failed",
          profile: profile ?? undefined,
          data: {
            error: String(error),
          },
        }).catch(() => undefined);
      });
  });
}
