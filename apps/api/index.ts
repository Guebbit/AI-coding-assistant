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
import { getLogger } from "../../packages/logger/logger";
import { ExtendedError, rejectResponse, successResponse, validateRecommendedEnvironment } from "../../packages/shared";
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

const log = getLogger("api");

/* ── Observability: log every agent/tool event to stdout ─────────────── */
on("*", (event) => {
  log.info("event_emitted", { eventType: event.type, payload: event.payload });
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

  log.info("run_request_received", { task, profile: profile ?? null, requestId: req.requestId });
  const writeEnabled = allowWrite === true;
  const agent = createAgent(writeEnabled);

  agent
    .run(task.trim(), profile ? { profile: profile as ModelProfile } : undefined)
    .then((result) => {
      log.info("run_request_completed", {
        taskLength: task.length,
        writeEnabled,
        profile: profile ?? null,
        requestId: req.requestId,
      });
      const response: RunResponse = { result };
      successResponse(res, response);
    })
    .catch((error: unknown) => {
      log.error("run_request_failed", { error: String(error), requestId: req.requestId });
      rejectResponse(res, 500, "Internal Server Error", [String(error)]);
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
  log.warn("route_not_found", { method: request.method, path: request.path, requestId: request.requestId });
  rejectResponse(response, 404, "Not Found");
});

/**
 * Global JSON error handler.
 * Handles MulterError, ExtendedError, and generic Error.
 */
app.use((error: Error, request: Request, response: Response, _next: NextFunction) => {
  if (response.headersSent) return;

  if (error instanceof MulterError) {
    log.error({
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

  log.error({
    requestId: request.requestId,
    message: error.message,
    stack: error.stack,
    name: error.name,
  });
  rejectResponse(response, 500, "Internal Server Error", [error.message]);
});

/* Default port for the Manna API server. */
const PORT = Number.parseInt(process.env.PORT ?? "3001", 10);

/* Run DB migrations on startup (fail-open — a DB outage must not prevent the
 * API from starting). */
runMigrations().catch((error: unknown) =>
  log.warn("api_db_migration_failed", { error: String(error) })
);

validateRecommendedEnvironment(log);

app.listen(PORT, () => {
  log.info("api_started", { url: `http://localhost:${PORT}` });
  log.info("ollama_configured", {
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
  });
});

/**
 * Last-resort process-level error handling.
 */
const unhandledRejections = new Map<Promise<unknown>, unknown>();
process
  .on("unhandledRejection", (reason, promise) => {
    log.error({ message: "unhandledRejection", reason: String(reason) });
    unhandledRejections.set(promise, reason);
  })
  .on("rejectionHandled", (promise) => {
    unhandledRejections.delete(promise);
  })
  .on("uncaughtException", (error, origin) => {
    log.error({ message: error.message, stack: error.stack, name: error.name, origin });
    if (process.env.NODE_ENV === "production") process.exit(1);
  });
