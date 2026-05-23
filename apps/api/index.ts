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
import { on } from "@/packages/events/bus";
import { logger } from "@/packages/logger/logger";
import {
  envNumber,
  ExtendedError,
  initI18n,
  rejectResponse,
  successResponse,
  t,
  validateRequiredEnvironment
} from "@/packages/shared";
import { registerIdeRoutes } from "./ide-endpoints";
import { registerUploadRoutes } from "./upload-endpoints";
import { registerStreamRoutes } from "./stream-endpoints";
import { registerSwarmRoutes } from "./swarm-endpoints";
import { registerInfoRoutes } from "./info-endpoints";
import { registerWorkflowRoutes } from "./workflow-endpoints";
import { registerChatRoutes } from "./chat-endpoints";
import { registerLibraryRoutes } from "./library-endpoints";
import { initializeAgents } from "./agents";
import { registerRunRoutes } from "./run-endpoints";
import { registerLogsRoutes } from "./logs-endpoints";
import { runMigrations } from "@/packages/persistence/migrate";
import { rateLimiter, requestIdMiddleware } from "./middlewares/security";
import type { HealthResponse } from "@/api";
import enTranslation from "@/packages/shared/locales/en.json";

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

/* Register chat endpoints (/chat/conversations). */
registerChatRoutes(app);

/* Register library endpoints (/library, /library/:id/import, etc.). */
registerLibraryRoutes(app);
/* Register run endpoint (POST /run). */
registerRunRoutes(app);

/* Register logs endpoint (GET /logs/errors). */
registerLogsRoutes(app);

/**
 * GET /health — simple liveness check.
 *
 * Used by monitoring tools and the Docker Compose healthcheck.
 * Returns 200 OK with a timestamp.
 */
app.get("/health", (_req, res) => {
  const startedAt = new Date();
  const response: HealthResponse = { status: "ok", timestamp: new Date().toISOString() };
  successResponse(res, response, 200, "", {
    startedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
  });
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
const PORT = envNumber(process.env.PORT, 3001);

try {
  validateRequiredEnvironment();
} catch (error) {
  logger.error('startup_required_env_missing', { component: 'api.server', error: String(error) });
  process.exit(1);
}

initI18n({ en: { translation: enTranslation } })
  .catch((error: unknown) => {
    logger.warn("i18n_init_failed", { component: "api.server", error: String(error) });
  })
  .finally(() => {
    runMigrations()
      .catch((error: unknown) =>
        logger.warn(t("info.migrations_failed"), { component: "api.server", error: String(error) })
      )
      .then(() =>
        initializeAgents().catch((error: unknown) =>
          logger.warn("agents_init_failed", { component: "api.server", error: String(error) })
        )
      )
      .finally(() => {
        app.listen(PORT, () => {
          logger.info(t("info.server_started"), { component: "api.server", url: `http://localhost:${PORT}` });
          logger.info("ollama_configured", {
            component: "api.server",
            ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
          });
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
