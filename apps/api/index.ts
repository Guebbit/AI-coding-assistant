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

import express from "express";
import cors from "cors";
import type { ModelProfile } from "../../packages/agent/model-router";
import { on } from "../../packages/events/bus";
import { getLogger } from "../../packages/logger/logger";
import { registerIdeRoutes } from "./ide-endpoints";
import { registerUploadRoutes } from "./upload-endpoints";
import { registerStreamRoutes } from "./stream-endpoints";
import { registerSwarmRoutes } from "./swarm-endpoints";
import { registerInfoRoutes } from "./info-endpoints";
import { registerWorkflowRoutes } from "./workflow-endpoints";
import { createAgent, VALID_PROFILES } from "./agents";
import { runMigrations } from "../../packages/persistence/migrate";

const log = getLogger("api");

/* ── Observability: log every agent/tool event to stdout ─────────────── */
on("*", (event) => {
  log.info("event_emitted", { eventType: event.type, payload: event.payload });
});

/* ── HTTP server ─────────────────────────────────────────────────────── */

const app = express();
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
app.post("/run", async (req, res) => {
  const { task, allowWrite, profile } = req.body as {
    task?: string;
    allowWrite?: boolean;
    profile?: string;
  };

  if (!task || typeof task !== "string" || task.trim() === "") {
    res
      .status(400)
      .json({ error: '"task" (non-empty string) is required in the request body' });
    return;
  }

  if (profile !== undefined && !VALID_PROFILES.has(profile as ModelProfile)) {
    res.status(400).json({
      error: `"profile" must be one of: ${[...VALID_PROFILES].join(", ")}`,
    });
    return;
  }

  try {
    log.info("run_request_received", { task, profile: profile ?? null });
    const writeEnabled = allowWrite === true;
    const agent = createAgent(writeEnabled);
    const result = await agent.run(
      task.trim(),
      profile ? { profile: profile as ModelProfile } : undefined,
    );
    log.info("run_request_completed", { taskLength: task.length, writeEnabled, profile: profile ?? null });
    res.json({ result });
  } catch (error) {
    log.error("run_request_failed", { error: String(error) });
    res.status(500).json({ error: String(error) });
  }
});

/**
 * GET /health — simple liveness check.
 *
 * Used by monitoring tools and the Docker Compose healthcheck.
 * Returns 200 OK with a timestamp.
 */
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

/* Default port for the Manna API server. */
const PORT = Number.parseInt(process.env.PORT ?? "3001", 10);

/* Run DB migrations on startup (fail-open — a DB outage must not prevent the
 * API from starting). */
runMigrations().catch((error: unknown) =>
  log.warn("api_db_migration_failed", { error: String(error) })
);

app.listen(PORT, () => {
  log.info("api_started", { url: `http://localhost:${PORT}` });
  log.info("ollama_configured", {
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
  });
});
