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
import ts from "typescript";
import { generate } from "../../packages/llm/ollama";
import { logger } from "../../packages/logger/logger";
import { rejectResponse, successResponse, t } from "../../packages/shared";
import type {
  AutocompleteRequest,
  AutocompleteResponse,
  LintConventionsRequest,
  LintResponse,
  PageReviewRequest,
  PageReviewResponse,
} from "../../api/models";

/** Names of the IDE endpoints, used as keys for rate-limit and timeout maps. */
type EndpointName = "autocomplete" | "lint-conventions" | "page-review";

/** Severity levels for lint/convention findings. */
type FindingSeverity = "error" | "warning" | "info";

/** Origin of a finding: TypeScript compiler, convention rule, or LLM review. */
type FindingSource = "typescript" | "convention" | "llm";

/**
 * A single lint/review finding reported to the client.
 *
 * Findings from all three sources (TypeScript, conventions, LLM) share
 * this shape so the IDE can render them uniformly.
 */
interface IFinding {
  /** Where this finding came from. */
  source: FindingSource;
  /** How severe the issue is. */
  severity: FindingSeverity;
  /** Grouping category (e.g. `"typescript"`, `"style"`, `"convention"`). */
  category: string;
  /** Human-readable description of the issue. */
  message: string;
  /** 1-based line number (optional). */
  line?: number;
  /** 1-based column number (optional). */
  column?: number;
  /** Machine-readable rule identifier (e.g. `"TS2345"`, `"no-tabs"`). */
  rule?: string;
}

/** Default Ollama model for autocomplete requests. */
const DEFAULT_AUTOCOMPLETE_MODEL = process.env.TOOL_IDE_MODEL ?? "starcoder2";

/** Default Ollama model for lint and page-review requests. */
const DEFAULT_REVIEW_MODEL =
  process.env.AGENT_MODEL_CODE ?? process.env.OLLAMA_MODEL ?? "starcoder2";

/** Rate-limit sliding window size (ms) per endpoint. */
const endpointWindowMs: Record<EndpointName, number> = {
  autocomplete: 60_000,
  "lint-conventions": 60_000,
  "page-review": 60_000,
};

/** Maximum requests allowed per client within the sliding window. */
const endpointMaxRequests: Record<EndpointName, number> = {
  autocomplete: 120,
  "lint-conventions": 30,
  "page-review": 20,
};

/** Per-endpoint LLM call timeout (ms), configurable via env vars. */
const endpointTimeoutMs: Record<EndpointName, number> = {
  autocomplete: Number.parseInt(process.env.AUTOCOMPLETE_TIMEOUT_MS ?? "2500", 10),
  "lint-conventions": Number.parseInt(process.env.LINT_CONVENTIONS_TIMEOUT_MS ?? "10000", 10),
  "page-review": Number.parseInt(process.env.PAGE_REVIEW_TIMEOUT_MS ?? "20000", 10),
};

/**
 * Per-endpoint, per-client sliding-window rate-limit buckets.
 * Outer key = endpoint name, inner key = client IP, value = request timestamps.
 */
const rateLimitBuckets = new Map<EndpointName, Map<string, number[]>>();

/**
 * In-memory autocomplete response cache.
 * Key = composite of prefix + suffix + language; value = cached response + TTL.
 */
const autocompleteCache = new Map<
  string,
  {
    completion: string;
    model: string;
    language: string;
    createdAtIso: string;
    expiresAt: number;
  }
>();

/** How long autocomplete responses stay cached (ms). */
const AUTOCOMPLETE_CACHE_TTL_MS = Number.parseInt(
  process.env.AUTOCOMPLETE_CACHE_TTL_MS ?? "30000",
  10,
);

/** Maximum number of entries in the autocomplete cache before pruning. */
const AUTOCOMPLETE_CACHE_MAX_ENTRIES = Number.parseInt(
  process.env.AUTOCOMPLETE_CACHE_MAX_ENTRIES ?? "500",
  10,
);

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

/** A single review suggestion with a title, detail, and priority. */
interface ICategorizedSuggestion {
  /** Short summary of the suggestion. */
  title: string;
  /** Detailed explanation or remediation advice. */
  detail: string;
  /** Importance level for triage. */
  priority: "high" | "medium" | "low";
}

/**
 * Shape of the `/page-review` response body.
 *
 * Each key is a review category containing an array of suggestions
 * returned by the LLM.
 */
interface IPageReviewResponseBody {
  /** Issues that could cause incorrect behaviour. */
  correctness: ICategorizedSuggestion[];
  /** Suggestions for improving code clarity and long-term maintenance. */
  maintainability: ICategorizedSuggestion[];
  /** Deviations from established coding standards. */
  standards: ICategorizedSuggestion[];
  /** Nice-to-have improvements that go beyond correctness. */
  enhancements: ICategorizedSuggestion[];
}

/**
 * Enforce a sliding-window rate limit for the given endpoint and client.
 *
 * Maintains a per-endpoint, per-client list of recent request
 * timestamps.  When the number of requests within the window exceeds
 * the configured maximum the function returns the `Retry-After`
 * value in seconds.
 *
 * @param endpointName  - Which endpoint is being called (e.g. `"autocomplete"`).
 * @param clientAddress - IP address (or forwarded-for) identifying the client.
 * @returns `null` if the request is allowed, or the number of seconds the
 *          client should wait before retrying.
 */
function enforceRateLimit(endpointName: EndpointName, clientAddress: string): number | null {
  const now = Date.now();
  const windowSize = endpointWindowMs[endpointName];
  const maxRequests = endpointMaxRequests[endpointName];
  const endpointBuckets = rateLimitBuckets.get(endpointName) ?? new Map<string, number[]>();
  const requests = endpointBuckets.get(clientAddress) ?? [];
  const currentWindowRequests = requests.filter((time) => now - time < windowSize);

  if (currentWindowRequests.length >= maxRequests) {
    const oldestRequest = currentWindowRequests[0];
    const retryAfterMs = Math.max(0, windowSize - (now - oldestRequest));
    rateLimitBuckets.set(endpointName, endpointBuckets);
    return Math.max(1, Math.ceil(retryAfterMs / 1000));
  }

  currentWindowRequests.push(now);
  endpointBuckets.set(clientAddress, currentWindowRequests);
  rateLimitBuckets.set(endpointName, endpointBuckets);
  return null;
}

/**
 * Race a promise against a timeout.
 *
 * If `work` does not resolve within `timeoutMs` milliseconds, the
 * returned promise rejects with a descriptive timeout error.
 *
 * @template T
 * @param work      - The async operation to time-box.
 * @param timeoutMs - Maximum allowed duration in milliseconds.
 * @param label     - Human-readable label included in the timeout error message.
 * @returns The result of `work` if it completes in time.
 * @throws {Error} When `work` exceeds the timeout.
 */
function withTimeout<T>(work: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    void work
      .then((result) => {
        clearTimeout(timeoutHandle);
        resolve(result);
      })
      .catch((error: unknown) => {
        clearTimeout(timeoutHandle);
        reject(error);
      });
  });
}

/**
 * Build a composite cache key for autocomplete responses.
 *
 * The key is a deterministic string derived from the prefix, suffix,
 * and language so that identical requests hit the cache.
 *
 * @param prefix   - Code text before the cursor.
 * @param suffix   - Code text after the cursor.
 * @param language - Programming language identifier.
 * @returns A composite string used as the cache map key.
 */
function createAutocompleteCacheKey(prefix: string, suffix: string, language: string): string {
  return `${language}\n---\n${prefix}\n---\n${suffix}`;
}

/**
 * Evict stale and excess entries from the autocomplete cache.
 *
 * 1. Remove all entries whose TTL has expired.
 * 2. If the cache still exceeds `AUTOCOMPLETE_CACHE_MAX_ENTRIES`,
 *    evict the oldest entries (by `expiresAt`) one at a time.
 */
function pruneAutocompleteCache(): void {
  const now = Date.now();
  for (const [cacheKey, cacheValue] of autocompleteCache.entries()) {
    if (cacheValue.expiresAt <= now) {
      autocompleteCache.delete(cacheKey);
    }
  }

  while (autocompleteCache.size > AUTOCOMPLETE_CACHE_MAX_ENTRIES) {
    let evictionKey: string | null = null;
    let oldestExpiry = Number.POSITIVE_INFINITY;
    for (const [cacheKey, cacheValue] of autocompleteCache.entries()) {
      if (cacheValue.expiresAt < oldestExpiry) {
        oldestExpiry = cacheValue.expiresAt;
        evictionKey = cacheKey;
      }
    }

    if (!evictionKey) {
      break;
    }

    autocompleteCache.delete(evictionKey);
  }
}

/**
 * Check whether the given language identifier refers to TypeScript (or TSX).
 *
 * @param language - Lowercase language string.
 * @returns `true` for `"typescript"`, `"ts"`, or `"tsx"`.
 */
function isTypeScriptLike(language: string): boolean {
  return language === "typescript" || language === "ts" || language === "tsx";
}

/**
 * Check whether the given language identifier refers to JavaScript (or JSX).
 *
 * @param language - Lowercase language string.
 * @returns `true` for `"javascript"`, `"js"`, or `"jsx"`.
 */
function isJavaScriptLike(language: string): boolean {
  return language === "javascript" || language === "js" || language === "jsx";
}

/**
 * Infer the programming language from the provided value or the file extension.
 *
 * Falls back to `"plaintext"` when neither the explicit language nor
 * the file extension yields a recognised language.
 *
 * @param providedLanguage - Explicit language string from the request (may be `undefined`).
 * @param filePath         - Optional file path used for extension-based inference.
 * @returns A normalised, lowercase language identifier.
 */
function inferLanguage(
  providedLanguage: string | undefined,
  filePath: string | undefined,
): string {
  if (providedLanguage && providedLanguage.trim()) {
    return providedLanguage.trim().toLowerCase();
  }

  if (!filePath) {
    return "plaintext";
  }

  const normalizedPath = filePath.toLowerCase();
  if (normalizedPath.endsWith(".ts") || normalizedPath.endsWith(".tsx")) {
    return "typescript";
  }

  if (normalizedPath.endsWith(".js") || normalizedPath.endsWith(".jsx")) {
    return "javascript";
  }

  if (normalizedPath.endsWith(".json")) {
    return "json";
  }

  return "plaintext";
}

/**
 * Run the TypeScript compiler on the given source code and return
 * diagnostics as `Finding` objects.
 *
 * Uses `ts.transpileModule` for a fast, in-memory compile without
 * needing a full project `tsconfig.json`.  TypeScript files get
 * strict mode; JavaScript files get `allowJs` with no type checking.
 *
 * @param content  - The source code to compile.
 * @param filePath - Virtual file name for diagnostics.
 * @param language - Language identifier (determines compiler options).
 * @returns An array of `Finding` objects extracted from TS diagnostics.
 */
function getTypeScriptFindings(
  content: string,
  filePath: string,
  language: string,
): IFinding[] {
  const compilerOptions: ts.CompilerOptions = isTypeScriptLike(language)
    ? {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        strict: true,
      }
    : {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        allowJs: true,
        checkJs: false,
      };

  const transpileResult = ts.transpileModule(content, {
    fileName: filePath,
    reportDiagnostics: true,
    compilerOptions,
  });

  const diagnostics = transpileResult.diagnostics ?? [];
  return diagnostics.map((diagnostic) => {
    const flattenedMessage = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
    const start = diagnostic.start ?? 0;
    const location = diagnostic.file?.getLineAndCharacterOfPosition(start);
    return {
      source: "typescript",
      severity:
        diagnostic.category === ts.DiagnosticCategory.Warning ? "warning" : "error",
      category: "typescript",
      message: flattenedMessage,
      line: location ? location.line + 1 : undefined,
      column: location ? location.character + 1 : undefined,
      rule: `TS${diagnostic.code}`,
    } satisfies IFinding;
  });
}

/**
 * Apply deterministic convention checks to the source code.
 *
 * These rules run without an LLM — they are simple line-by-line
 * pattern checks (max line length, trailing whitespace, tabs,
 * `console.log`, `var`, explicit `any`).
 *
 * @param content  - The source code to check.
 * @param language - Language identifier (some rules are TS-only).
 * @returns An array of `Finding` objects for style/convention violations.
 */
function getConventionFindings(content: string, language: string): IFinding[] {
  const findings: IFinding[] = [];
  const lines = content.split("\n");

  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;

    if (line.length > 120) {
      findings.push({
        source: "convention",
        severity: "warning",
        category: "style",
        message: "Line exceeds 120 characters",
        line: lineNumber,
        column: 121,
        rule: "max-line-length",
      });
    }

    if (/\s+$/.test(line)) {
      findings.push({
        source: "convention",
        severity: "warning",
        category: "style",
        message: "Trailing whitespace detected",
        line: lineNumber,
        column: line.search(/\s+$/) + 1,
        rule: "no-trailing-whitespace",
      });
    }

    if (line.includes("\t")) {
      findings.push({
        source: "convention",
        severity: "warning",
        category: "style",
        message: "Tab indentation detected; prefer spaces",
        line: lineNumber,
        column: line.indexOf("\t") + 1,
        rule: "no-tabs",
      });
    }

    if (/\bconsole\.log\(/.test(line)) {
      findings.push({
        source: "convention",
        severity: "info",
        category: "convention",
        message: "Avoid console.log in committed source code",
        line: lineNumber,
        column: line.search(/\bconsole\.log\(/) + 1,
        rule: "no-console-log",
      });
    }

    if (/\bvar\s+[$A-Z_a-z]/.test(line)) {
      findings.push({
        source: "convention",
        severity: "warning",
        category: "convention",
        message: "Prefer let/const over var",
        line: lineNumber,
        column: line.search(/\bvar\s+/) + 1,
        rule: "prefer-let-const",
      });
    }

    if (isTypeScriptLike(language) && /:\s*any\b/.test(line)) {
      findings.push({
        source: "convention",
        severity: "warning",
        category: "convention",
        message: "Avoid explicit any when possible",
        line: lineNumber,
        column: line.search(/:\s*any\b/) + 1,
        rule: "no-explicit-any",
      });
    }
  }

  return findings;
}

/**
 * Validate and normalise a single LLM-generated finding object.
 *
 * The LLM may return partially-formed or unexpected shapes.  This
 * function coerces the candidate into a well-formed `Finding` or
 * returns `null` if it cannot be salvaged.
 *
 * @param candidate - Raw value from the LLM JSON response.
 * @returns A normalised `Finding`, or `null` if the candidate is invalid.
 */
function normalizeLlmFinding(candidate: unknown): IFinding | null {
  if (typeof candidate !== "object" || candidate === null) {
    return null;
  }

  const objectCandidate = candidate as Record<string, unknown>;
  const severityRaw =
    typeof objectCandidate.severity === "string"
      ? objectCandidate.severity.toLowerCase()
      : "info";
  const allowedSeverities: FindingSeverity[] = ["error", "warning", "info"];
  const severity = allowedSeverities.includes(severityRaw as FindingSeverity)
    ? (severityRaw as FindingSeverity)
    : "info";

  if (typeof objectCandidate.message !== "string" || objectCandidate.message.trim() === "") {
    return null;
  }

  return {
    source: "llm",
    severity,
    category:
      typeof objectCandidate.category === "string" && objectCandidate.category.trim()
        ? objectCandidate.category.trim()
        : "convention",
    message: objectCandidate.message.trim(),
    line:
      typeof objectCandidate.line === "number" && Number.isFinite(objectCandidate.line)
        ? objectCandidate.line
        : undefined,
    column:
      typeof objectCandidate.column === "number" && Number.isFinite(objectCandidate.column)
        ? objectCandidate.column
        : undefined,
    rule:
      typeof objectCandidate.rule === "string" && objectCandidate.rule.trim()
        ? objectCandidate.rule.trim()
        : undefined,
  };
}

/**
 * Validate and normalise a single LLM-generated page-review suggestion.
 *
 * @param candidate - Raw value from the LLM JSON response.
 * @returns A normalised `CategorizedSuggestion`, or `null` if invalid.
 */
function normalizePageReviewSuggestion(candidate: unknown): ICategorizedSuggestion | null {
  if (typeof candidate !== "object" || candidate === null) {
    return null;
  }

  const objectCandidate = candidate as Record<string, unknown>;
  if (
    typeof objectCandidate.title !== "string" ||
    objectCandidate.title.trim() === "" ||
    typeof objectCandidate.detail !== "string" ||
    objectCandidate.detail.trim() === ""
  ) {
    return null;
  }

  const priorityRaw =
    typeof objectCandidate.priority === "string"
      ? objectCandidate.priority.toLowerCase()
      : "medium";
  const priority: "high" | "medium" | "low" =
    priorityRaw === "high" || priorityRaw === "low" ? priorityRaw : "medium";

  return {
    title: objectCandidate.title.trim(),
    detail: objectCandidate.detail.trim(),
    priority,
  };
}

/**
 * Parse the raw LLM JSON string into a `PageReviewResponseBody`.
 *
 * Tolerates malformed JSON by returning an empty fallback.  Each
 * category array is individually validated and capped at 12 items.
 *
 * @param raw - Raw JSON string from the LLM.
 * @returns A fully-formed `PageReviewResponseBody` (may have empty arrays).
 */
function parsePageReviewBody(raw: string): IPageReviewResponseBody {
  const fallback: IPageReviewResponseBody = {
    correctness: [],
    maintainability: [],
    standards: [],
    enhancements: [],
  };

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const categories: Array<keyof IPageReviewResponseBody> = [
      "correctness",
      "maintainability",
      "standards",
      "enhancements",
    ];
    for (const category of categories) {
      const rawList = Array.isArray(parsed[category]) ? parsed[category] : [];
      fallback[category] = rawList
        .map((item) => normalizePageReviewSuggestion(item))
        .filter((item): item is ICategorizedSuggestion => item !== null)
        .slice(0, 12);
    }
  } catch {
    return fallback;
  }

  return fallback;
}

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

/**
 * Send a 429 Too Many Requests response with a `Retry-After` header.
 *
 * @param response           - The Express response object.
 * @param retryAfterSeconds  - Seconds the client should wait.
 */
function sendRateLimitedResponse(
  response: express.Response,
  retryAfterSeconds: number,
): void {
  response.setHeader("Retry-After", String(retryAfterSeconds));
  rejectResponse(response, 429, "Too Many Requests", [
    `Rate limit exceeded. Retry after ${retryAfterSeconds} second(s).`,
  ]);
}

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
  application.post("/autocomplete", (request, response) => {
    const clientAddress = resolveClientAddress(request);
    const retryAfterSeconds = enforceRateLimit("autocomplete", clientAddress);
    if (retryAfterSeconds !== null) {
      sendRateLimitedResponse(response, retryAfterSeconds);
      return;
    }

    const parsed = autocompleteSchema.safeParse(request.body as AutocompleteRequest);
    if (!parsed.success) {
      rejectResponse(response, 400, "Bad Request", [
        `Invalid request body: ${JSON.stringify(parsed.error.flatten())}`,
      ]);
      return;
    }

    const startedAt = Date.now();
    const prefix = parsed.data.prefix;
    const suffix = parsed.data.suffix;
    const language = parsed.data.language?.trim() ?? "plaintext";
    const cacheKey = createAutocompleteCacheKey(prefix, suffix ?? "", language);
    const now = Date.now();
    const cacheHit = autocompleteCache.get(cacheKey);
    if (cacheHit && cacheHit.expiresAt > now) {
      const payload = {
        completion: cacheHit.completion,
        model: cacheHit.model,
        language: cacheHit.language,
        cached: true,
        latencyMs: Date.now() - startedAt,
        createdAtIso: cacheHit.createdAtIso,
      };
      const typedPayload: AutocompleteResponse = payload;
      successResponse(response, typedPayload);
      return;
    }

    const prompt =
      `You are an IDE autocomplete engine.\n` +
      `Return only the exact code continuation with no markdown.\n` +
      `Language: ${language}\n` +
      `Code before cursor:\n${prefix}`;

    withTimeout(
      generate(prompt, {
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
      .then((completion) => {
        const completionTrimmed = completion.trim();
        const payload = {
          completion: completionTrimmed,
          model: DEFAULT_AUTOCOMPLETE_MODEL,
          language,
          cached: false,
          latencyMs: Date.now() - startedAt,
          createdAtIso: new Date().toISOString(),
        };
        autocompleteCache.set(cacheKey, {
          completion: payload.completion,
          model: payload.model,
          language: payload.language,
          createdAtIso: payload.createdAtIso,
          expiresAt: now + AUTOCOMPLETE_CACHE_TTL_MS,
        });
        pruneAutocompleteCache();
        const typedPayload: AutocompleteResponse = payload;
        successResponse(response, typedPayload);
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

  application.post("/lint-conventions", (request, response) => {
    const clientAddress = resolveClientAddress(request);
    const retryAfterSeconds = enforceRateLimit("lint-conventions", clientAddress);
    if (retryAfterSeconds !== null) {
      sendRateLimitedResponse(response, retryAfterSeconds);
      return;
    }

    const requestBody = request.body as LintConventionsRequest & {
      content?: string;
      filePath?: string;
    };
    const normalizedBody = {
      ...requestBody,
      code: requestBody.code ?? requestBody.content,
      filename: requestBody.filename ?? requestBody.filePath,
    };
    const parsed = lintConventionsSchema.safeParse(normalizedBody);
    if (!parsed.success) {
      rejectResponse(response, 400, "Bad Request", [
        `Invalid request body: ${JSON.stringify(parsed.error.flatten())}`,
      ]);
      return;
    }

    const startedAt = Date.now();
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

    const llmFindingsPromise = parsed.data.includeLlm
      ? withTimeout(
          generate(
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
          .then((rawLlmResponse) => {
            const parsedLlmResponse = JSON.parse(rawLlmResponse);
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
        latencyMs: Date.now() - startedAt,
      };
      const typedPayload: LintResponse = payload;
      successResponse(response, typedPayload);
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

  application.post("/page-review", (request, response) => {
    const clientAddress = resolveClientAddress(request);
    const retryAfterSeconds = enforceRateLimit("page-review", clientAddress);
    if (retryAfterSeconds !== null) {
      sendRateLimitedResponse(response, retryAfterSeconds);
      return;
    }

    const requestBody = request.body as PageReviewRequest & {
      content?: string;
      filePath?: string;
    };
    const normalizedBody = {
      ...requestBody,
      code: requestBody.code ?? requestBody.content,
      filename: requestBody.filename ?? requestBody.filePath,
    };
    const parsed = pageReviewSchema.safeParse(normalizedBody);
    if (!parsed.success) {
      rejectResponse(response, 400, "Bad Request", [
        `Invalid request body: ${JSON.stringify(parsed.error.flatten())}`,
      ]);
      return;
    }

    const startedAt = Date.now();
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
      generate(prompt, {
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
      .then((rawReview) => {
        const categories = parsePageReviewBody(rawReview);
        const payload = {
          requestId,
          model,
          language,
          filePath,
          findings: Object.values(categories).flat(),
          categories,
          latencyMs: Date.now() - startedAt,
        };
        const typedPayload: PageReviewResponse = payload;
        successResponse(response, typedPayload);
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
