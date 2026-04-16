/**
 * IDE-specific HTTP endpoints — direct LLM calls (not agent-loop).
 *
 * These endpoints are registered on the Express app and provide:
 * - `POST /autocomplete`       — cursor-time code completion.
 * - `POST /lint-conventions`   — deterministic + LLM-enriched lint findings.
 * - `POST /page-review`        — categorised code review for a full file.
 *
 * Each endpoint has its own rate limiter, timeout, and input schema.
 * Responses are single-shot LLM calls — they do **not** enter the
 * agent reasoning loop.
 *
 * @module apps/api/ide-endpoints
 */

import type express from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { generateWithMetadata } from "@/packages/llm/ollama";
import { logger } from "@/packages/logger/logger";
import { rejectResponse, successResponse, t, withTimeout, buildResponseMeta, inferLanguage, isTypeScriptLike, isJavaScriptLike } from "@/packages/shared";
import type {
  AutocompleteRequest,
  AutocompleteResponse,
  LintConventionsRequest,
  LintResponse,
  PageReviewRequest,
  PageReviewResponse,
} from "@/api/models";
import { buildCacheKey, getCached, setCached } from "./ide/cache";
import {
  getTypeScriptFindings,
  getConventionFindings,
  normalizeLlmFinding,
  parsePageReviewBody,
  type IFinding,
  type IPageReviewResponseBody,
} from "./ide/typescript-analysis";

/** Default Ollama model for autocomplete requests. */
const DEFAULT_AUTOCOMPLETE_MODEL = process.env.TOOL_IDE_MODEL ?? "starcoder2";

/** Default Ollama model for lint and page-review requests. */
const DEFAULT_REVIEW_MODEL =
  process.env.AGENT_MODEL_CODE ?? process.env.OLLAMA_MODEL ?? "starcoder2";

/** Per-endpoint LLM call timeout (ms), configurable via env vars. */
const endpointTimeoutMs = {
  autocomplete: Number.parseInt(process.env.AUTOCOMPLETE_TIMEOUT_MS ?? "2500", 10),
  "lint-conventions": Number.parseInt(process.env.LINT_CONVENTIONS_TIMEOUT_MS ?? "10000", 10),
  "page-review": Number.parseInt(process.env.PAGE_REVIEW_TIMEOUT_MS ?? "20000", 10),
} as const;

/** Max tokens the autocomplete LLM call may generate. */
const AUTOCOMPLETE_MAX_TOKENS = Number.parseInt(
  process.env.AUTOCOMPLETE_MAX_TOKENS ?? "128",
  10,
);

/** Max tokens the lint-conventions LLM call may generate. */
const LINT_CONVENTIONS_MAX_TOKENS = Number.parseInt(
  process.env.LINT_CONVENTIONS_MAX_TOKENS ?? "600",
  10,
);

/** Max tokens the page-review LLM call may generate. */
const PAGE_REVIEW_MAX_TOKENS = Number.parseInt(
  process.env.PAGE_REVIEW_MAX_TOKENS ?? "1200",
  10,
);

// ---------------------------------------------------------------------------
// Rate limiters — one per endpoint, using express-rate-limit.
// ---------------------------------------------------------------------------

const autocompleteRateLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

const lintRateLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

const pageReviewRateLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

// ---------------------------------------------------------------------------
// Zod request schemas.
// ---------------------------------------------------------------------------

/** Zod schema for `POST /autocomplete` request body. */
const autocompleteSchema = z.object({
  /** Code text before the cursor. */
  prefix: z.string().min(1),
  /** Code text after the cursor (optional, for fill-in-the-middle). */
  suffix: z.string().optional(),
  /** Programming language hint (e.g. `"typescript"`). */
  language: z.string().min(1).optional(),
});

/** Zod schema for `POST /lint-conventions` request body. */
const lintConventionsSchema = z.object({
  /** Source code to analyse. */
  code: z.string().min(1),
  /** Programming language hint. */
  language: z.string().min(1).optional(),
  /** File path used for language inference and diagnostics context. */
  filename: z.string().min(1).optional(),
  /** Whether to enrich findings with an LLM review pass (default: `true`). */
  includeLlm: z.boolean().optional().default(true),
  /** Override the LLM model used for enrichment. */
  model: z.string().min(1).optional(),
  /** Maximum number of findings to return (default: 80, max: 200). */
  maxFindings: z.number().int().positive().max(200).optional().default(80),
});

/** Zod schema for `POST /page-review` request body. */
const pageReviewSchema = z.object({
  /** Full source code to review. */
  code: z.string().min(1),
  /** Programming language hint. */
  language: z.string().min(1).optional(),
  /** File path — helps the LLM understand context. */
  filename: z.string().min(1).optional(),
  /** Optional free-text project context the reviewer should consider. */
  projectContext: z.string().optional(),
  /** Override the LLM model used for the review. */
  model: z.string().min(1).optional(),
});

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

/**
 * Extract the client's IP address from the request.
 *
 * Checks `X-Forwarded-For` first (for proxied requests), then falls
 * back to `req.ip` and finally `req.socket.remoteAddress`.
 *
 * @param request - The Express request object.
 * @returns A string identifying the client.
 */
function resolveClientAddress(request: express.Request): string {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }

  return request.ip || request.socket.remoteAddress || "unknown";
}

// ---------------------------------------------------------------------------
// Route registration.
// ---------------------------------------------------------------------------

/**
 * Register the IDE-specific routes on the Express application.
 *
 * Called once from `apps/api/index.ts` at startup.  This function
 * attaches three `POST` handlers: `/autocomplete`,
 * `/lint-conventions`, and `/page-review`.
 *
 * @param application - The Express app instance to register routes on.
 * @returns Nothing.
 */
export function registerIdeRoutes(application: express.Express): void {
  application.post("/autocomplete", autocompleteRateLimiter, (request, response) => {
    const parsed = autocompleteSchema.safeParse(request.body as AutocompleteRequest);
    if (!parsed.success) {
      rejectResponse(response, 400, "Bad Request", [
        `Invalid request body: ${JSON.stringify(parsed.error.flatten())}`,
      ]);
      return;
    }

    const startedAt = new Date();
    const prefix = parsed.data.prefix;
    const suffix = parsed.data.suffix;
    const language = parsed.data.language?.trim() ?? "plaintext";
    const cacheKey = buildCacheKey(prefix, suffix ?? "", language);
    const cacheHit = getCached(cacheKey);
    if (cacheHit) {
      const payload = {
        completion: cacheHit.completion,
        model: cacheHit.model,
        language: cacheHit.language,
        cached: true,
        latencyMs: Date.now() - startedAt.getTime(),
        createdAtIso: cacheHit.createdAtIso,
      };
      const typedPayload: AutocompleteResponse = payload;
      successResponse(response, typedPayload, 200, "", {
        ...buildResponseMeta(startedAt, request),
        model: cacheHit.model,
      });
      return;
    }

    const prompt =
      `You are an IDE autocomplete engine.\n` +
      `Return only the exact code continuation with no markdown.\n` +
      `Language: ${language}\n` +
      `Code before cursor:\n${prefix}`;

    withTimeout(
      generateWithMetadata(prompt, {
        model: DEFAULT_AUTOCOMPLETE_MODEL,
        stream: false,
        suffix,
        options: {
          num_predict: AUTOCOMPLETE_MAX_TOKENS,
          temperature: 0.2,
          top_p: 0.95,
        },
      }),
      endpointTimeoutMs.autocomplete,
      "autocomplete",
    )
      .then((llmResult) => {
        const completionTrimmed = llmResult.response.trim();
        const totalTokens =
          typeof llmResult.promptEvalCount === "number" && typeof llmResult.evalCount === "number"
            ? llmResult.promptEvalCount + llmResult.evalCount
            : undefined;
        const createdAtIso = new Date().toISOString();
        const payload = {
          completion: completionTrimmed,
          model: DEFAULT_AUTOCOMPLETE_MODEL,
          language,
          cached: false,
          latencyMs: Date.now() - startedAt.getTime(),
          createdAtIso,
        };
        setCached(cacheKey, {
          completion: payload.completion,
          model: payload.model,
          language: payload.language,
          createdAtIso,
        });
        const typedPayload: AutocompleteResponse = payload;
        successResponse(response, typedPayload, 200, "", {
          ...buildResponseMeta(startedAt, request),
          model: llmResult.model,
          ...(typeof llmResult.promptEvalCount === "number" ? { promptTokens: llmResult.promptEvalCount } : {}),
          ...(typeof llmResult.evalCount === "number" ? { completionTokens: llmResult.evalCount } : {}),
          ...(typeof totalTokens === "number" ? { totalTokens } : {}),
        });
      })
      .catch((error: unknown) => {
        logger.error("autocomplete_failed", {
          component: "api.ide",
          error: String(error),
          language,
        });
        rejectResponse(response, 500, t("error.internal_server_error"), [String(error)]);
      });
  });

  application.post("/lint-conventions", lintRateLimiter, (request, response) => {
    const requestBody = request.body as LintConventionsRequest;
    const parsed = lintConventionsSchema.safeParse(requestBody);
    if (!parsed.success) {
      rejectResponse(response, 400, "Bad Request", [
        `Invalid request body: ${JSON.stringify(parsed.error.flatten())}`,
      ]);
      return;
    }

    const startedAt = new Date();
    const filePath = parsed.data.filename?.trim() || "in-memory.ts";
    const language = inferLanguage(parsed.data.language, filePath);
    const deterministicFindings = [
      ...(isTypeScriptLike(language) || isJavaScriptLike(language)
        ? getTypeScriptFindings(parsed.data.code, filePath, language)
        : []),
      ...getConventionFindings(parsed.data.code, language),
    ];

    const llmModelUsed = parsed.data.includeLlm
      ? parsed.data.model?.trim() || DEFAULT_REVIEW_MODEL
      : undefined;
    let llmPromptTokens: number | undefined;
    let llmCompletionTokens: number | undefined;

    const llmFindingsPromise = parsed.data.includeLlm
      ? withTimeout(
          generateWithMetadata(
            `You are a strict code reviewer for conventions and linting.\n` +
              `Return ONLY JSON as an array of findings.\n` +
              `Each finding object must have: severity (error|warning|info), category, message, optional line, optional column, optional rule.\n` +
              `Avoid duplicates of obvious syntax errors.\n` +
              `Language: ${language}\n` +
              `File path: ${filePath}\n` +
              `Code:\n${parsed.data.code}`,
            {
              model: llmModelUsed,
              stream: false,
              format: "json",
              options: {
                num_predict: LINT_CONVENTIONS_MAX_TOKENS,
                temperature: 0.15,
              },
            },
          ),
          endpointTimeoutMs["lint-conventions"],
          "lint-conventions",
        )
          .then((llmResult) => {
            llmPromptTokens = llmResult.promptEvalCount;
            llmCompletionTokens = llmResult.evalCount;
            const parsedLlmResponse = JSON.parse(llmResult.response);
            const asArray = Array.isArray(parsedLlmResponse)
              ? parsedLlmResponse
              : Array.isArray(parsedLlmResponse.findings)
                ? parsedLlmResponse.findings
                : [];
            return (asArray as unknown[])
              .map((finding: unknown) => normalizeLlmFinding(finding))
              .filter((finding: IFinding | null): finding is IFinding => finding !== null)
              .slice(0, parsed.data.maxFindings);
          })
          .catch((error: unknown) => {
            logger.warn("lint_conventions_llm_enrichment_failed", {
              component: "api.ide",
              error: String(error),
            });
            return [] as IFinding[];
          })
      : Promise.resolve([] as IFinding[]);

    llmFindingsPromise.then((llmFindings) => {
      const findings = [...deterministicFindings, ...llmFindings].slice(0, parsed.data.maxFindings);
      const summary = {
        total: findings.length,
        errors: findings.filter((item) => item.severity === "error").length,
        warnings: findings.filter((item) => item.severity === "warning").length,
        infos: findings.filter((item) => item.severity === "info").length,
        deterministicCount: deterministicFindings.length,
        llmCount: llmFindings.length,
      };

      const payload = {
        requestId: randomUUID(),
        language,
        filePath,
        summary,
        findings,
        llmModelUsed,
        latencyMs: Date.now() - startedAt.getTime(),
      };
      const typedPayload: LintResponse = payload;
      const totalTokens =
        typeof llmPromptTokens === "number" && typeof llmCompletionTokens === "number"
          ? llmPromptTokens + llmCompletionTokens
          : undefined;
      successResponse(response, typedPayload, 200, "", {
        ...buildResponseMeta(startedAt, request),
        ...(llmModelUsed ? { model: llmModelUsed } : {}),
        ...(typeof llmPromptTokens === "number" ? { promptTokens: llmPromptTokens } : {}),
        ...(typeof llmCompletionTokens === "number" ? { completionTokens: llmCompletionTokens } : {}),
        ...(typeof totalTokens === "number" ? { totalTokens } : {}),
      });
    }).catch((error: unknown) => {
      logger.error("lint_conventions_failed", {
        component: "api.ide",
        error: String(error),
        language,
        filePath,
      });
      rejectResponse(response, 500, t("error.internal_server_error"), [String(error)]);
    });
  });

  application.post("/page-review", pageReviewRateLimiter, (request, response) => {
    const requestBody = request.body as PageReviewRequest;
    const parsed = pageReviewSchema.safeParse(requestBody);
    if (!parsed.success) {
      rejectResponse(response, 400, "Bad Request", [
        `Invalid request body: ${JSON.stringify(parsed.error.flatten())}`,
      ]);
      return;
    }

    const startedAt = new Date();
    const requestId = randomUUID();
    const filePath = parsed.data.filename?.trim() ?? "in-memory";
    const language = inferLanguage(parsed.data.language, filePath);
    const model = parsed.data.model?.trim() || DEFAULT_REVIEW_MODEL;
    const projectContext = parsed.data.projectContext?.trim() ?? "";

    const prompt =
      `You are performing a whole-file engineering review.\n` +
      `Return ONLY valid JSON object with keys: correctness, maintainability, standards, enhancements.\n` +
      `Each key must be an array of objects: { "title": string, "detail": string, "priority": "high"|"medium"|"low" }.\n` +
      `Focus on missing pieces, standards compliance, and practical improvement ideas.\n` +
      `Language: ${language}\n` +
      `File path: ${filePath}\n` +
      `Project context: ${projectContext || "none"}\n` +
      `Code:\n${parsed.data.code}`;

    withTimeout(
      generateWithMetadata(prompt, {
        model,
        stream: false,
        format: "json",
        options: {
          num_predict: PAGE_REVIEW_MAX_TOKENS,
          temperature: 0.2,
        },
      }),
      endpointTimeoutMs["page-review"],
      "page-review",
    )
      .then((llmResult) => {
        const categories: IPageReviewResponseBody = parsePageReviewBody(llmResult.response);
        const totalTokens =
          typeof llmResult.promptEvalCount === "number" && typeof llmResult.evalCount === "number"
            ? llmResult.promptEvalCount + llmResult.evalCount
            : undefined;
        const payload = {
          requestId,
          model,
          language,
          filePath,
          findings: Object.values(categories).flat(),
          categories,
          latencyMs: Date.now() - startedAt.getTime(),
        };
        const typedPayload: PageReviewResponse = payload;
        successResponse(response, typedPayload, 200, "", {
          ...buildResponseMeta(startedAt, request),
          model: llmResult.model,
          ...(typeof llmResult.promptEvalCount === "number" ? { promptTokens: llmResult.promptEvalCount } : {}),
          ...(typeof llmResult.evalCount === "number" ? { completionTokens: llmResult.evalCount } : {}),
          ...(typeof totalTokens === "number" ? { totalTokens } : {}),
        });
      })
      .catch((error: unknown) => {
        logger.error("page_review_failed", {
          component: "api.ide",
          error: String(error),
          language,
          filePath,
          requestId,
        });
        rejectResponse(response, 500, t("error.internal_server_error"), [String(error)]);
      });
  });
}
