import express from "express";
import rateLimit from "express-rate-limit";
import { Agent } from "../../../packages/agent/src/agent";
import {
  readFileTool,
  shellTool,
  mysqlQueryTool,
  linkedinProfileLookupTool,
  xProfileLookupTool,
  githubProfileLookupTool,
  isSocialProvider,
  SOCIAL_PROVIDER_POLICIES,
  createAuthorizationUrl,
  consumeOAuthState,
  exchangeCodeForToken,
  getConnectionsSummary,
  setToken,
  unlinkProvider,
  getDefaultRedirectUri,
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
const agent = new Agent([
  readFileTool,
  shellTool,
  mysqlQueryTool,
  linkedinProfileLookupTool,
  xProfileLookupTool,
  githubProfileLookupTool,
]);

// ── HTTP server ────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// OAuth endpoints are externally reachable and can be abuse targets; keep a tight cap.
const oauthRateLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many OAuth requests. Please retry later." },
});

app.get("/auth/providers", (_req, res) => {
  res.json({
    providers: Object.values(SOCIAL_PROVIDER_POLICIES).map((provider) => ({
      provider: provider.provider,
      displayName: provider.displayName,
      allowedActions: provider.allowedActions,
      defaultScopes: provider.defaultScopes,
      docsUrl: provider.docsUrl,
    })),
  });
});

app.get("/auth/connections", (_req, res) => {
  res.json({ connections: getConnectionsSummary() });
});

app.get("/auth/:provider/connect", oauthRateLimiter, (req, res) => {
  const { provider } = req.params;
  if (!isSocialProvider(provider)) {
    res.status(400).json({ error: `Unsupported provider: ${provider}` });
    return;
  }

  const redirectUri =
    typeof req.query.redirect_uri === "string" && req.query.redirect_uri.trim()
      ? req.query.redirect_uri.trim()
      : getDefaultRedirectUri(provider);

  try {
    const { authorizationUrl, state } = createAuthorizationUrl(
      provider,
      redirectUri
    );
    res.json({
      provider,
      authorizationUrl,
      state,
      message: `Open authorizationUrl, approve access, then call /auth/${provider}/callback with code and state.`,
    });
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

app.get("/auth/:provider/callback", oauthRateLimiter, async (req, res) => {
  const { provider } = req.params;
  if (!isSocialProvider(provider)) {
    res.status(400).json({ error: `Unsupported provider: ${provider}` });
    return;
  }

  const code =
    typeof req.query.code === "string" ? req.query.code.trim() : "";
  const state =
    typeof req.query.state === "string" ? req.query.state.trim() : "";

  if (!code || !state) {
    res.status(400).json({ error: "Missing required query params: code, state." });
    return;
  }

  try {
    const stateRecord = consumeOAuthState(state, provider);
    const token = await exchangeCodeForToken(provider, code, stateRecord.redirectUri);
    setToken(provider, token);

    res.json({
      status: "connected",
      provider,
      connections: getConnectionsSummary(),
    });
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

app.delete("/auth/:provider/connection", (req, res) => {
  const { provider } = req.params;
  if (!isSocialProvider(provider)) {
    res.status(400).json({ error: `Unsupported provider: ${provider}` });
    return;
  }
  unlinkProvider(provider);
  res.json({
    status: "disconnected",
    provider,
    connections: getConnectionsSummary(),
  });
});

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
