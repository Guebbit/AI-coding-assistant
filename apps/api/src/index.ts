import express from "express";
import { Agent } from "../../../packages/agent/src/agent";
import {
  readFileTool,
  shellTool,
  mysqlQueryTool,
} from "../../../packages/tools/src/index";
import { on } from "../../../packages/events/src/bus";

// ── Observability: log all agent events to stdout ──────────────────────────
on("*", (event) => {
  console.log(`[event] ${event.type}`, JSON.stringify(event.payload));
});

// ── Initialise agent with available tools ──────────────────────────────────
// Add / remove tools here as you expand the system.
// The browser tool is excluded by default because it requires Playwright
// browsers to be installed (`npx playwright install chromium`).
const agent = new Agent([readFileTool, shellTool, mysqlQueryTool]);

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
    const result = await agent.run(task.trim());
    res.json({ result });
  } catch (err) {
    console.error("Agent error:", err);
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
  console.log(`API running on http://localhost:${PORT}`);
  console.log(
    "Ollama URL:",
    process.env.OLLAMA_BASE_URL ?? "http://localhost:11434"
  );
});
