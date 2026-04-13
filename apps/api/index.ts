/**
 * Express API entry point — wires all packages into an HTTP server.
 *
 * Endpoints:
 * - `POST /run`                    — submit a task to the agent loop.
 * - `GET  /health`                 — liveness check for monitoring / Docker.
 * - `GET  /v1/models`              — OpenAI-compatible model list.
 * - `POST /v1/chat/completions`    — OpenAI-compatible chat completions.
 *
 * IDE-specific routes (`/autocomplete`, `/lint-conventions`,
 * `/page-review`) are registered from `ide-endpoints.ts`.
 * OpenAI-compatible routes are registered from `openai-compat.ts`.
 *
 * @module apps/api
 */

import express from "express";
import type { ModelProfile } from "../../packages/agent/model-router";
import { on } from "../../packages/events/bus";
import { getLogger } from "../../packages/logger/logger";
import { registerIdeRoutes } from "./ide-endpoints";
import { registerUploadRoutes } from "./upload-endpoints";
import { registerOpenAiRoutes } from "./openai-compat";
import { createAgent, VALID_PROFILES } from "./agents";

const log = getLogger("api");

/* ── Observability: log every agent/tool event to stdout ─────────────── */
on("*", (event) => {
  log.info("event_emitted", { eventType: event.type, payload: event.payload });
});

/* ── HTTP server ─────────────────────────────────────────────────────── */

const app = express();
app.use(express.json());

/* Register IDE-specific direct-LLM endpoints. */
registerIdeRoutes(app);

/* Register file-upload endpoints (image, audio, PDF). */
registerUploadRoutes(app);

/* Register OpenAI-compatible endpoints (/v1/models, /v1/chat/completions).
 * TODO: Remove once the custom Manna frontend ships — this is a temporary
 *       Open WebUI bridge. See apps/api/openai-compat.ts for details. */
registerOpenAiRoutes(app);

/**
 * POST /run — submit a task to the agent reasoning loop.
 *
 * Request body:
 * ```json
 * {
 *   "task":          "describe what you want the agent to do",
 *   "allowWrite":    false,
 *   "profile":       "fast",
 *   "resumeContext": "<condensed context from a previous context_overflow response>"
 * }
 * ```
 *
 * - `task` (required) — natural-language task description.
 * - `allowWrite` (optional, default `false`) — enable `write_file`
 *   and `scaffold_project` tools.
 * - `profile` (optional) — force a model profile (`fast`, `reasoning`,
 *   `code`, or `default`), bypassing automatic routing.
 * - `resumeContext` (optional) — condensed context string from a previous
 *   `context_overflow` response.  When provided, the agent resumes from
 *   this context instead of starting fresh.
 *
 * Response:
 * ```json
 * {
 *   "status": "completed" | "max_steps" | "context_overflow",
 *   "result": "agent's final answer or summary",
 *   "condensedContext": "...",   // present when status === "context_overflow"
 *   "originalTask": "...",       // present when status !== "completed"
 *   "suggestion": "..."          // present when status !== "completed"
 * }
 * ```
 */
app.post("/run", async (req, res) => {
  const { task, allowWrite, profile, resumeContext } = req.body as {
    task?: string;
    allowWrite?: boolean;
    profile?: string;
    resumeContext?: string;
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
    const runOptions = {
      ...(profile ? { profile: profile as ModelProfile } : {}),
      ...(resumeContext ? { resumeContext } : {}),
    };
    const runResult = await agent.run(task.trim(), runOptions);
    log.info("run_request_completed", {
      taskLength: task.length,
      writeEnabled,
      profile: profile ?? null,
      status: runResult.status,
    });
    res.json(runResult);
  } catch (err) {
    log.error("run_request_failed", { error: String(err) });
    res.status(500).json({ error: String(err) });
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

/* Default to 3001 — port 3000 is reserved for Open WebUI in docker-compose.yml. */
const PORT = Number.parseInt(process.env.PORT ?? "3001", 10);

app.listen(PORT, () => {
  log.info("api_started", { url: `http://localhost:${PORT}` });
  log.info("ollama_configured", {
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
  });
});
