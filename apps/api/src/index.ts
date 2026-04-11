import express from "express";
import { Agent } from "../../../packages/agent/src/agent";
import {
  readFileTool,
  shellTool,
  mysqlQueryTool,
  browserTool,
} from "../../../packages/tools/src/index";
import { on } from "../../../packages/events/src/bus";
import { getLogger } from "../../../packages/logger/src/logger";

const log = getLogger("api");

// ── Observability: log all agent events to stdout ──────────────────────────
on("*", (event) => {
  log.info("event_emitted", { eventType: event.type, payload: event.payload });
});

// ── Initialise agent with available tools ──────────────────────────────────
// Add / remove tools here as you expand the system.
const agent = new Agent([readFileTool, shellTool, mysqlQueryTool, browserTool]);

// ── HTTP server ────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

/**
 * POST /run
 *
 * Body:    { "task": "describe what you want the agent to do" }
 * Response: { "result": "agent's final answer" }
 */
app.post("/run", async (req, res) => {
  const { task } = req.body as { task?: string };

  if (!task || typeof task !== "string" || task.trim() === "") {
    res
      .status(400)
      .json({ error: '"task" (non-empty string) is required in the request body' });
    return;
  }

  try {
    log.info("run_request_received", { task });
    const result = await agent.run(task.trim());
    log.info("run_request_completed", { taskLength: task.length });
    res.json({ result });
  } catch (err) {
    log.error("run_request_failed", { error: String(err) });
    res.status(500).json({ error: String(err) });
  }
});

/**
 * GET /health
 *
 * Simple health check used by monitoring tools and the Docker compose
 * healthcheck.  Returns 200 OK with a timestamp.
 */
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Default to 3001 — port 3000 is reserved for Open WebUI in docker-compose.yml
const PORT = parseInt(process.env.PORT ?? "3001", 10);

app.listen(PORT, () => {
  log.info("api_started", { url: `http://localhost:${PORT}` });
  log.info("ollama_configured", {
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
  });
});
