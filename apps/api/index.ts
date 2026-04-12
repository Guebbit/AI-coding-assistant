import express from "express";
import { Agent } from "../../packages/agent/agent";
import type { ModelProfile } from "../../packages/agent/model-router";
import {
  readFileTool,
  writeFileTool,
  shellTool,
  mysqlQueryTool,
  browserTool,
  scaffoldProjectTool,
  imageClassifyTool,
  semanticSearchTool,
  speechToTextTool,
  readPdfTool,
  codeAutocompleteTool,
} from "../../packages/tools/index";
import { on } from "../../packages/events/bus";
import { getLogger } from "../../packages/logger/logger";
import { registerIdeRoutes } from "./ide-endpoints";

const log = getLogger("api");

// ── Observability: log all agent events to stdout ──────────────────────────
on("*", (event) => {
  log.info("event_emitted", { eventType: event.type, payload: event.payload });
});

const readOnlyTools = [
  readFileTool,
  shellTool,
  mysqlQueryTool,
  browserTool,
  imageClassifyTool,
  semanticSearchTool,
  speechToTextTool,
  readPdfTool,
  codeAutocompleteTool,
];
const writeTools = [writeFileTool, scaffoldProjectTool];
const readOnlyAgent = new Agent(readOnlyTools);
const writeEnabledAgent = new Agent([...readOnlyTools, ...writeTools]);

const VALID_PROFILES = new Set<ModelProfile>(["fast", "reasoning", "code", "default"]);

function createAgent(allowWrite: boolean): Agent {
  return allowWrite ? writeEnabledAgent : readOnlyAgent;
}

// ── HTTP server ────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
registerIdeRoutes(app);

/**
 * POST /run
 *
 * Body:    {
 *   "task": "describe what you want the agent to do",
 *   "allowWrite": false,   // optional; when true enables write/scaffold tools
 *   "profile": "fast"      // optional; one of fast|reasoning|code|default.
 *                          //   When provided, skips automatic model routing and
 *                          //   uses the specified profile for every step.
 * }
 * Response: { "result": "agent's final answer" }
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
const PORT = Number.parseInt(process.env.PORT ?? "3001", 10);

app.listen(PORT, () => {
  log.info("api_started", { url: `http://localhost:${PORT}` });
  log.info("ollama_configured", {
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
  });
});
