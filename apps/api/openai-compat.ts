/**
 * OpenAI-compatible API endpoints — allows any OpenAI-compatible client
 * (e.g. Open WebUI) to connect to Manna as a backend.
 *
 * Endpoints:
 * - `GET  /v1/models`             — list available Manna model profiles.
 * - `POST /v1/chat/completions`   — translate an OpenAI chat request into
 *                                   a Manna `agent.run()` call and return
 *                                   the result in OpenAI's response format.
 *
 * Streaming (`stream: true`) is supported: the agent response is buffered
 * and sent as a single SSE chunk followed by `[DONE]`.
 *
 * ---
 * **⚠ TEMPORARY — to be removed when the custom Manna frontend is ready.**
 *
 * This entire module exists solely as an Open WebUI bridge so that Manna
 * can be used without a dedicated frontend.  Once a custom frontend is
 * available, these endpoints should be deleted along with the registration
 * call in `apps/api/index.ts` and the shared `apps/api/agents.ts` module
 * (if it is no longer needed by any other route).
 * ---
 *
 * @module apps/api/openai-compat
 * @deprecated Temporary Open WebUI bridge — remove when the custom frontend ships.
 */

import type express from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getLogger } from "../../packages/logger/logger";
import { createAgent, VALID_PROFILES } from "./agents";
import type { ModelProfile } from "../../packages/agent/model-router";

const log = getLogger("api-openai");

/* ── Constants ───────────────────────────────────────────────────────── */

/**
 * Fixed creation timestamp used for all model list entries.
 * A real epoch value keeps OpenAI-client parsers happy.
 */
const MODEL_CREATED_AT = 1_700_000_000;

/**
 * Prefix that, when present at the start of the last user message,
 * enables write tools for that request.
 * Example: `"[WRITE] Scaffold a new React project in /tmp/my-app"`
 */
const WRITE_PREFIX = "[WRITE]";

/** Rate-limit window in milliseconds for OpenAI-compat endpoints. */
const RATE_LIMIT_WINDOW_MS = 60_000;

/** Maximum requests per client per window for `/v1/chat/completions`. */
const CHAT_COMPLETIONS_MAX_REQUESTS = Number.parseInt(
  process.env.OPENAI_COMPAT_RATE_LIMIT ?? "60",
  10,
);

/** Maximum requests per client per window for `/v1/models`. */
const MODELS_MAX_REQUESTS = 120;

/** Per-client sliding-window buckets for rate limiting. */
const rateLimitBuckets = new Map<string, Map<string, number[]>>();

/* ── Model catalogue ─────────────────────────────────────────────────── */

/**
 * A single entry in the OpenAI `ListModelsResponse` `data` array.
 */
interface OpenAiModelEntry {
  /** Unique model identifier (e.g. `"manna"`, `"manna-fast"`). */
  id: string;
  /** Always `"model"` per the OpenAI spec. */
  object: "model";
  /** Unix timestamp when this model was "created". */
  created: number;
  /** Organisation that owns the model. */
  owned_by: string;
}

/** All Manna model IDs exposed to OpenAI-compatible clients. */
const MANNA_MODELS: OpenAiModelEntry[] = [
  { id: "manna", object: "model", created: MODEL_CREATED_AT, owned_by: "manna" },
  { id: "manna-agent", object: "model", created: MODEL_CREATED_AT, owned_by: "manna" },
  { id: "manna-fast", object: "model", created: MODEL_CREATED_AT, owned_by: "manna" },
  { id: "manna-reasoning", object: "model", created: MODEL_CREATED_AT, owned_by: "manna" },
  { id: "manna-code", object: "model", created: MODEL_CREATED_AT, owned_by: "manna" },
];

/* ── Zod schemas ─────────────────────────────────────────────────────── */

/**
 * Schema for a single message in the OpenAI `messages` array.
 * Supports plain string content as well as multipart content arrays.
 */
const chatMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.union([
    z.string(),
    z.array(
      z.union([
        z.object({ type: z.literal("text"), text: z.string() }),
        z.object({
          type: z.literal("image_url"),
          image_url: z.object({ url: z.string() }),
        }),
      ]),
    ),
  ]),
});

/** Shape of a single chat message, inferred from `chatMessageSchema`. */
type ChatMessage = z.infer<typeof chatMessageSchema>;

/**
 * Zod schema for the `POST /v1/chat/completions` request body.
 *
 * Fields beyond `model` and `messages` are accepted but intentionally
 * ignored — Manna controls generation parameters via model profiles.
 */
const chatCompletionsSchema = z.object({
  /** Target model ID, e.g. `"manna"`, `"manna-fast"`. */
  model: z.string().min(1),
  /** Conversation history; must contain at least one message. */
  messages: z.array(chatMessageSchema).min(1),
  /** When `true`, return the response as a Server-Sent Events stream. */
  stream: z.boolean().optional().default(false),
  /** Manna extension: explicitly opt in to write tools. */
  allowWrite: z.boolean().optional().default(false),
  // Accepted but ignored — kept so clients don't receive validation errors.
  temperature: z.number().optional(),
  max_tokens: z.number().optional(),
  top_p: z.number().optional(),
  frequency_penalty: z.number().optional(),
  presence_penalty: z.number().optional(),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
  n: z.number().optional(),
});

/* ── Helpers ─────────────────────────────────────────────────────────── */

/**
 * Extract the client's IP address from the request.
 *
 * Checks `X-Forwarded-For` first (proxied requests), then falls back
 * to `req.ip` and `req.socket.remoteAddress`.
 *
 * @param request - The Express request object.
 * @returns A non-empty string identifying the client.
 */
function resolveClientAddress(request: express.Request): string {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return request.ip || request.socket.remoteAddress || "unknown";
}

/**
 * Enforce a sliding-window rate limit for a named endpoint + client pair.
 *
 * @param endpointKey   - Logical name of the endpoint (used as bucket key).
 * @param clientAddress - Client identifier (IP).
 * @param maxRequests   - Maximum requests allowed within `RATE_LIMIT_WINDOW_MS`.
 * @returns `null` if the request is allowed; seconds to wait if rate-limited.
 */
function enforceRateLimit(
  endpointKey: string,
  clientAddress: string,
  maxRequests: number,
): number | null {
  const now = Date.now();
  const endpointBuckets = rateLimitBuckets.get(endpointKey) ?? new Map<string, number[]>();
  const requests = endpointBuckets.get(clientAddress) ?? [];
  const windowRequests = requests.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  if (windowRequests.length >= maxRequests) {
    const oldestRequest = windowRequests[0];
    const retryAfterMs = Math.max(0, RATE_LIMIT_WINDOW_MS - (now - oldestRequest));
    rateLimitBuckets.set(endpointKey, endpointBuckets);
    return Math.max(1, Math.ceil(retryAfterMs / 1000));
  }

  windowRequests.push(now);
  endpointBuckets.set(clientAddress, windowRequests);
  rateLimitBuckets.set(endpointKey, endpointBuckets);
  return null;
}

/**
 * Send a 429 Too Many Requests response with a `Retry-After` header.
 *
 * @param response          - Express response.
 * @param retryAfterSeconds - Seconds the client should wait.
 */
function sendRateLimitedResponse(response: express.Response, retryAfterSeconds: number): void {
  response.setHeader("Retry-After", String(retryAfterSeconds));
  response.status(429).json({ error: "Rate limit exceeded", retryAfterSeconds });
}

/**
 * Map an OpenAI model ID string to a Manna `ModelProfile`.
 *
 * | Model ID            | Manna profile |
 * |---------------------|---------------|
 * | `"manna-fast"`      | `"fast"`      |
 * | `"manna-reasoning"` | `"reasoning"` |
 * | `"manna-code"`      | `"code"`      |
 * | anything else       | `undefined`   |
 *
 * When `undefined` is returned the agent uses automatic profile routing.
 *
 * @param modelId - The `model` field from the request body.
 * @returns A `ModelProfile` string or `undefined`.
 */
function mapModelToProfile(modelId: string): ModelProfile | undefined {
  switch (modelId) {
    case "manna-fast":
      return "fast";
    case "manna-reasoning":
      return "reasoning";
    case "manna-code":
      return "code";
    default:
      return undefined;
  }
}

/**
 * Extract plain-text content from a chat message.
 *
 * Handles both string content and multipart content arrays (picks the
 * first `text` part, ignores `image_url` entries).
 *
 * @param message - A parsed chat message.
 * @returns The textual content, or an empty string if none is found.
 */
function extractTextContent(message: ChatMessage): string {
  if (typeof message.content === "string") {
    return message.content;
  }

  for (const part of message.content) {
    if (part.type === "text") {
      return part.text;
    }
  }

  return "";
}

/* ── Route registration ──────────────────────────────────────────────── */

/**
 * Register OpenAI-compatible routes on the Express application.
 *
 * Called once from `apps/api/index.ts` at startup.  Attaches:
 * - `GET  /v1/models`
 * - `POST /v1/chat/completions`
 *
 * **⚠ TEMPORARY** — this function and the entire `openai-compat.ts` module
 * are a stopgap bridge for Open WebUI.  Remove this registration call (and
 * the module) once the custom Manna frontend is available.
 *
 * @param application - The Express app instance to register routes on.
 * @deprecated Temporary Open WebUI bridge — remove when the custom frontend ships.
 * @todo Remove this function and `openai-compat.ts` when the custom frontend is ready.
 */
export function registerOpenAiRoutes(application: express.Express): void {
  /* ── GET /v1/models ──────────────────────────────────────────────── */

  application.get("/v1/models", (request, response) => {
    const clientAddress = resolveClientAddress(request);
    const retryAfterSeconds = enforceRateLimit("v1/models", clientAddress, MODELS_MAX_REQUESTS);
    if (retryAfterSeconds !== null) {
      sendRateLimitedResponse(response, retryAfterSeconds);
      return;
    }

    log.info("openai_models_requested", { clientAddress });
    response.json({ object: "list", data: MANNA_MODELS });
  });

  /* ── POST /v1/chat/completions ───────────────────────────────────── */

  application.post("/v1/chat/completions", async (request, response) => {
    const clientAddress = resolveClientAddress(request);
    const retryAfterSeconds = enforceRateLimit(
      "v1/chat/completions",
      clientAddress,
      CHAT_COMPLETIONS_MAX_REQUESTS,
    );
    if (retryAfterSeconds !== null) {
      sendRateLimitedResponse(response, retryAfterSeconds);
      return;
    }

    const parsed = chatCompletionsSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        error: "Invalid request body",
        details: parsed.error.flatten(),
      });
      return;
    }

    const { model, messages, stream, allowWrite } = parsed.data;

    /* Find the last user message in the conversation. */
    const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUserMessage) {
      response.status(400).json({ error: "messages must contain at least one user message" });
      return;
    }

    let task = extractTextContent(lastUserMessage).trim();
    if (!task) {
      response.status(400).json({ error: "Last user message must have non-empty text content" });
      return;
    }

    /* Determine write permission from the body flag or the [WRITE] prefix. */
    let writeEnabled = allowWrite === true;
    if (task.startsWith(WRITE_PREFIX)) {
      writeEnabled = true;
      task = task.slice(WRITE_PREFIX.length).trim();
    }

    const profile = mapModelToProfile(model);

    // Validate any explicitly forced profile (guard against unknown manna-* IDs).
    if (profile !== undefined && !VALID_PROFILES.has(profile)) {
      response.status(400).json({
        error: `Unrecognized model profile derived from model "${model}"`,
      });
      return;
    }

    const completionId = `chatcmpl-${randomUUID()}`;
    const createdAt = Math.floor(Date.now() / 1000);

    log.info("openai_chat_completion_request", {
      completionId,
      model,
      profile: profile ?? "auto",
      writeEnabled,
      taskLength: task.length,
      stream,
    });

    try {
      const agent = createAgent(writeEnabled);
      const result = await agent.run(task, profile ? { profile } : undefined);

      log.info("openai_chat_completion_done", {
        completionId,
        model,
        resultLength: result.length,
      });

      if (stream) {
        /* ── SSE streaming response ────────────────────────────────── */
        response.setHeader("Content-Type", "text/event-stream");
        response.setHeader("Cache-Control", "no-cache");
        response.setHeader("Connection", "keep-alive");

        const chunkBase = {
          id: completionId,
          object: "chat.completion.chunk",
          created: createdAt,
          model,
        };

        // First chunk: assistant role + content
        const contentChunk = {
          ...chunkBase,
          choices: [
            {
              index: 0,
              delta: { role: "assistant", content: result },
              finish_reason: null,
            },
          ],
        };
        response.write(`data: ${JSON.stringify(contentChunk)}\n\n`);

        // Final chunk: finish_reason stop
        const stopChunk = {
          ...chunkBase,
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        };
        response.write(`data: ${JSON.stringify(stopChunk)}\n\n`);

        response.write("data: [DONE]\n\n");
        response.end();
        return;
      }

      /* ── Non-streaming JSON response ───────────────────────────── */
      response.json({
        id: completionId,
        object: "chat.completion",
        created: createdAt,
        model,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: result },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        },
      });
    } catch (error) {
      log.error("openai_chat_completion_failed", {
        completionId,
        model,
        error: String(error),
      });
      response.status(500).json({ error: String(error) });
    }
  });
}
