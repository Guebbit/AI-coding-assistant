/**
 * Express API entry point — wires all packages into an HTTP server.
 *
 * Endpoints:
 * - `POST /run`                    — submit a task to the agent loop.
 * - `POST /run/stream`             — streaming variant of `/run` (SSE).
 * - `POST /run/swarm`              — submit a task to the swarm orchestrator.
 * - `POST /run/swarm/stream`       — swarm orchestrator with SSE streaming.
 * - `POST /workflow`               — run an explicit ordered list of steps sequentially.
 * - `POST /workflow/stream`        — streaming variant of `/workflow` (SSE).
 * - `GET  /health`                 — liveness check for monitoring / Docker.
 * - `GET  /info/modes`             — list Manna agent routing profiles.
 * - `GET  /info/models`            — list models available in Ollama.
 * - `GET  /help`                   — structured overview of all API endpoints.
 *
 * IDE-specific routes (`/autocomplete`, `/lint-conventions`,
 * `/page-review`) are registered from `ide-endpoints.ts`.
 * Swarm routes are registered from `swarm-endpoints.ts`.
 * Workflow routes are registered from `workflow-endpoints.ts`.
 * Informational routes (`/info/modes`, `/info/models`, `/help`) are
 * registered from `info-endpoints.ts`.
 *
 * @module apps/api
 */

import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { MulterError } from "multer";
import type { ModelProfile } from "../../packages/agent/model-router";
import { on } from "../../packages/events/bus";
import { logger } from "../../packages/logger/logger";
import {
  envInt,
  ExtendedError,
  initI18n,
  rejectResponse,
  successResponse,
  validateTask,
  validateProfile,
  t,
  validateRecommendedEnvironment
} from "../../packages/shared";
import { registerIdeRoutes } from "./ide-endpoints";
import { registerUploadRoutes } from "./upload-endpoints";
import { registerStreamRoutes } from "./stream-endpoints";
import { registerSwarmRoutes } from "./swarm-endpoints";
import { registerInfoRoutes } from "./info-endpoints";
import { registerWorkflowRoutes } from "./workflow-endpoints";
import { createAgent, VALID_PROFILES } from "./agents";
import { runMigrations } from "../../packages/persistence/migrate";
import { rateLimiter, requestIdMiddleware } from "./middlewares/security";
import type { HealthResponse, RunRequest, RunResponse } from "../../api/models";
import enTranslation from "../../packages/shared/locales/en.json";

/* ── Observability: log every agent/tool event to stdout ─────────────── */
on("*", (event) => {
  logger.info("event_emitted", { component: "api.events", eventType: event.type, payload: event.payload });
});

/* ── HTTP server ─────────────────────────────────────────────────────── */

const app = express();
app.use(helmet());
app.use(requestIdMiddleware);
app.use(rateLimiter);
app.use(cors({ origin: process.env.CORS_ORIGIN ?? "*" }));
app.use(express.json());

/* Register IDE-specific direct-LLM endpoints. */
registerIdeRoutes(app);

/* Register file-upload endpoints (image, audio, PDF). */
registerUploadRoutes(app);

/* Register SSE streaming endpoint (POST /run/stream). */
registerStreamRoutes(app);

/* Register swarm endpoints (POST /run/swarm, POST /run/swarm/stream). */
registerSwarmRoutes(app);

/* Register workflow endpoints (POST /workflow, POST /workflow/stream). */
registerWorkflowRoutes(app);

/* Register informational endpoints (/info/modes, /info/models, /help). */
registerInfoRoutes(app);

/**
 * POST /run — submit a task to the agent reasoning loop.
 *
 * Request body:
 * ```json
 * {
 *   "task":       "describe what you want the agent to do",
 *   "allowWrite": false,
 *   "profile":    "fast"
 * }
 * ```
 *
 * - `task` (required) — natural-language task description.
 * - `allowWrite` (optional, default `false`) — enable `write_file`
 *   and `scaffold_project` tools.
 * - `profile` (optional) — force a model profile (`fast`, `reasoning`,
 *   `code`, or `default`), bypassing automatic routing.
 *
 * Response: `{ "result": "agent's final answer" }`
 */
app.post("/run", (req, res) => {
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

  logger.info("run_request_received", {
    component: "api.server",
    task,
    profile: profile ?? null,
    requestId: req.requestId
  });
  const writeEnabled = allowWrite === true;
  const agent = createAgent(writeEnabled);

  agent
    .run(task, profile ? { profile: profile as ModelProfile } : undefined)
    .then((result) => {
      logger.info("run_request_completed", {
        component: "api.server",
        taskLength: task.length,
        writeEnabled,
        profile: profile ?? null,
        requestId: req.requestId,
      });
      const response: RunResponse = { result };
      successResponse(res, response);
    })
    .catch((error: unknown) => {
      logger.error("run_request_failed", { component: "api.server", error: String(error), requestId: req.requestId });
      rejectResponse(res, 500, t("error.internal_server_error"), [String(error)]);
    });
});

/**
 * GET /health — simple liveness check.
 *
 * Used by monitoring tools and the Docker Compose healthcheck.
 * Returns 200 OK with a timestamp.
 */
app.get("/health", (_req, res) => {
  const response: HealthResponse = { status: "ok", timestamp: new Date() };
  successResponse(res, response);
});

/**
 * 404 catch-all — unmatched routes.
 */
app.use((request: Request, response: Response) => {
  logger.warn("route_not_found", {
    component: "api.server",
    method: request.method,
    path: request.path,
    requestId: request.requestId
  });
  rejectResponse(response, 404, t("error.not_found"));
});

/**
 * Global JSON error handler.
 * Handles MulterError, ExtendedError, and generic Error.
 */
app.use((error: Error, request: Request, response: Response, _next: NextFunction) => {
  if (response.headersSent) return;

  if (error instanceof MulterError) {
    logger.error({
      component: "api.server",
      requestId: request.requestId,
      message: error.message,
      code: error.code,
      field: error.field,
    });
    rejectResponse(response, 400, error.message, [error.code]);
    return;
  }

  if (error instanceof ExtendedError) {
    rejectResponse(response, error.httpCode, error.name, error.errors);
    return;
  }

  logger.error({
    component: "api.server",
    requestId: request.requestId,
    message: error.message,
    stack: error.stack,
    name: error.name,
  });
  rejectResponse(response, 500, t("error.internal_server_error"), [error.message]);
});

/* Default port for the Manna API server. */
const PORT = envInt(process.env.PORT, 3001);

/* Run DB migrations on startup (fail-open — a DB outage must not prevent the
 * API from starting). */
runMigrations().catch((error: unknown) =>
  logger.warn(t("info.migrations_failed"), { component: "api.server", error: String(error) })
);

validateRecommendedEnvironment({
  warn: (message: string, meta?: object) => logger.warn(message, { component: "api.environment", ...meta })
});

initI18n({ en: { translation: enTranslation } })
  .catch((error: unknown) => {
    logger.warn("i18n_init_failed", { component: "api.server", error: String(error) });
  })
  .finally(() => {
    app.listen(PORT, () => {
      logger.info(t("info.server_started"), { component: "api.server", url: `http://localhost:${PORT}` });
      logger.info("ollama_configured", {
        component: "api.server",
        ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
      });
    });
  });

/**
 * Last-resort process-level error handling.
 */
const unhandledRejections = new Map<Promise<unknown>, unknown>();
process
  .on("unhandledRejection", (reason, promise) => {
    logger.error({ component: "api.server", message: "unhandledRejection", reason: String(reason) });
    unhandledRejections.set(promise, reason);
  })
  .on("rejectionHandled", (promise) => {
    unhandledRejections.delete(promise);
  })
  .on("uncaughtException", (error, origin) => {
    logger.error({ component: "api.server", message: error.message, stack: error.stack, name: error.name, origin });
    if (process.env.NODE_ENV === "production") process.exit(1);
  });
