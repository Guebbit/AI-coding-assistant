import type express from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import ts from "typescript";
import { generate } from "../../packages/llm/ollama";
import { getLogger } from "../../packages/logger/logger";

const log = getLogger("api-ide");

type EndpointName = "autocomplete" | "lint-conventions" | "page-review";
type FindingSeverity = "error" | "warning" | "info";
type FindingSource = "typescript" | "convention" | "llm";

interface Finding {
  source: FindingSource;
  severity: FindingSeverity;
  category: string;
  message: string;
  line?: number;
  column?: number;
  rule?: string;
}

const DEFAULT_AUTOCOMPLETE_MODEL = process.env.TOOL_IDE_MODEL ?? "starcoder2";
const DEFAULT_REVIEW_MODEL =
  process.env.AGENT_MODEL_CODE ?? process.env.OLLAMA_MODEL ?? "starcoder2";

const endpointWindowMs: Record<EndpointName, number> = {
  autocomplete: 60_000,
  "lint-conventions": 60_000,
  "page-review": 60_000,
};

const endpointMaxRequests: Record<EndpointName, number> = {
  autocomplete: 120,
  "lint-conventions": 30,
  "page-review": 20,
};

const endpointTimeoutMs: Record<EndpointName, number> = {
  autocomplete: Number.parseInt(process.env.AUTOCOMPLETE_TIMEOUT_MS ?? "2500", 10),
  "lint-conventions": Number.parseInt(process.env.LINT_CONVENTIONS_TIMEOUT_MS ?? "10_000", 10),
  "page-review": Number.parseInt(process.env.PAGE_REVIEW_TIMEOUT_MS ?? "20_000", 10),
};

const rateLimitBuckets = new Map<EndpointName, Map<string, number[]>>();
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

const AUTOCOMPLETE_CACHE_TTL_MS = Number.parseInt(
  process.env.AUTOCOMPLETE_CACHE_TTL_MS ?? "30000",
  10,
);
const AUTOCOMPLETE_CACHE_MAX_ENTRIES = Number.parseInt(
  process.env.AUTOCOMPLETE_CACHE_MAX_ENTRIES ?? "500",
  10,
);

const autocompleteSchema = z.object({
  prefix: z.string().min(1),
  suffix: z.string().optional(),
  language: z.string().min(1).optional(),
});

const lintConventionsSchema = z.object({
  content: z.string().min(1),
  language: z.string().min(1).optional(),
  filePath: z.string().min(1).optional(),
  includeLlm: z.boolean().optional().default(true),
  model: z.string().min(1).optional(),
  maxFindings: z.number().int().positive().max(200).optional().default(80),
});

const pageReviewSchema = z.object({
  content: z.string().min(1),
  language: z.string().min(1).optional(),
  filePath: z.string().min(1).optional(),
  projectContext: z.string().optional(),
  model: z.string().min(1).optional(),
});

interface CategorizedSuggestion {
  title: string;
  detail: string;
  priority: "high" | "medium" | "low";
}

interface PageReviewResponseBody {
  correctness: CategorizedSuggestion[];
  maintainability: CategorizedSuggestion[];
  standards: CategorizedSuggestion[];
  enhancements: CategorizedSuggestion[];
}

function enforceRateLimit(endpointName: EndpointName, clientAddress: string): number | null {
  const now = Date.now();
  const windowSize = endpointWindowMs[endpointName];
  const maxRequests = endpointMaxRequests[endpointName];
  const endpointBuckets = rateLimitBuckets.get(endpointName) ?? new Map<string, number[]>();
  const requests = endpointBuckets.get(clientAddress) ?? [];
  const currentWindowRequests = requests.filter((time) => now - time < windowSize);

  if (currentWindowRequests.length >= maxRequests) {
    const oldestRequest = currentWindowRequests[0];
    const retryAfterMs = windowSize - (now - oldestRequest);
    rateLimitBuckets.set(endpointName, endpointBuckets);
    return Math.max(1, Math.ceil(retryAfterMs / 1000));
  }

  currentWindowRequests.push(now);
  endpointBuckets.set(clientAddress, currentWindowRequests);
  rateLimitBuckets.set(endpointName, endpointBuckets);
  return null;
}

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

function createAutocompleteCacheKey(prefix: string, suffix: string, language: string): string {
  return `${language}\n---\n${prefix}\n---\n${suffix}`;
}

function pruneAutocompleteCache(): void {
  while (autocompleteCache.size > AUTOCOMPLETE_CACHE_MAX_ENTRIES) {
    const firstKey = autocompleteCache.keys().next().value;
    if (firstKey === undefined) {
      break;
    }

    autocompleteCache.delete(firstKey);
  }
}

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

function getTypeScriptFindings(content: string, filePath: string): Finding[] {
  const transpileResult = ts.transpileModule(content, {
    fileName: filePath,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      strict: true,
    },
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
    } satisfies Finding;
  });
}

function getConventionFindings(content: string, language: string): Finding[] {
  const findings: Finding[] = [];
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

    if (/\bvar\s+[a-zA-Z_$]/.test(line)) {
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

    if (
      (language === "typescript" || language === "ts" || language === "tsx") &&
      /:\s*any\b/.test(line)
    ) {
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

function normalizeLlmFinding(candidate: unknown): Finding | null {
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

function normalizePageReviewSuggestion(candidate: unknown): CategorizedSuggestion | null {
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

function parsePageReviewBody(raw: string): PageReviewResponseBody {
  const fallback: PageReviewResponseBody = {
    correctness: [],
    maintainability: [],
    standards: [],
    enhancements: [],
  };

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const categories: Array<keyof PageReviewResponseBody> = [
      "correctness",
      "maintainability",
      "standards",
      "enhancements",
    ];
    for (const category of categories) {
      const rawList = Array.isArray(parsed[category]) ? parsed[category] : [];
      fallback[category] = rawList
        .map((item) => normalizePageReviewSuggestion(item))
        .filter((item): item is CategorizedSuggestion => item !== null)
        .slice(0, 12);
    }
  } catch {
    return fallback;
  }

  return fallback;
}

function resolveClientAddress(request: express.Request): string {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }

  return request.ip || request.socket.remoteAddress || "unknown";
}

function sendRateLimitedResponse(
  response: express.Response,
  retryAfterSeconds: number,
): void {
  response.setHeader("Retry-After", String(retryAfterSeconds));
  response.status(429).json({
    error: "Rate limit exceeded",
    retryAfterSeconds,
  });
}

export function registerIdeRoutes(application: express.Express): void {
  application.post("/autocomplete", async (request, response) => {
    const clientAddress = resolveClientAddress(request);
    const retryAfterSeconds = enforceRateLimit("autocomplete", clientAddress);
    if (retryAfterSeconds !== null) {
      sendRateLimitedResponse(response, retryAfterSeconds);
      return;
    }

    const parsed = autocompleteSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        error: "Invalid request body",
        details: parsed.error.flatten(),
      });
      return;
    }

    const startedAt = Date.now();
    const prefix = parsed.data.prefix;
    const suffix = parsed.data.suffix?.trim() ?? "";
    const language = parsed.data.language?.trim() ?? "plaintext";
    const cacheKey = createAutocompleteCacheKey(prefix, suffix, language);
    const now = Date.now();
    const cacheHit = autocompleteCache.get(cacheKey);
    if (cacheHit && cacheHit.expiresAt > now) {
      response.json({
        completion: cacheHit.completion,
        model: cacheHit.model,
        language: cacheHit.language,
        cached: true,
        latencyMs: Date.now() - startedAt,
        createdAtIso: cacheHit.createdAtIso,
      });
      return;
    }

    try {
      const prompt =
        `You are an IDE autocomplete engine.\n` +
        `Return only the exact code continuation with no markdown.\n` +
        `Language: ${language}\n` +
        `Code before cursor:\n${prefix}`;

      const completion = await withTimeout(
        generate(prompt, {
          model: DEFAULT_AUTOCOMPLETE_MODEL,
          stream: false,
          suffix: suffix || undefined,
          options: {
            num_predict: 128,
            temperature: 0.2,
            top_p: 0.95,
          },
        }),
        endpointTimeoutMs.autocomplete,
        "autocomplete",
      );

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
      response.json(payload);
    } catch (error) {
      log.error("autocomplete_failed", {
        error: String(error),
        language,
      });
      response.status(500).json({ error: String(error) });
    }
  });

  application.post("/lint-conventions", async (request, response) => {
    const clientAddress = resolveClientAddress(request);
    const retryAfterSeconds = enforceRateLimit("lint-conventions", clientAddress);
    if (retryAfterSeconds !== null) {
      sendRateLimitedResponse(response, retryAfterSeconds);
      return;
    }

    const parsed = lintConventionsSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        error: "Invalid request body",
        details: parsed.error.flatten(),
      });
      return;
    }

    const startedAt = Date.now();
    const filePath = parsed.data.filePath?.trim() || "in-memory.ts";
    const language = inferLanguage(parsed.data.language, filePath);
    const deterministicFindings = [
      ...(language.includes("typescript") || language.includes("javascript")
        ? getTypeScriptFindings(parsed.data.content, filePath)
        : []),
      ...getConventionFindings(parsed.data.content, language),
    ];

    let llmFindings: Finding[] = [];
    let llmModelUsed: string | null = null;
    if (parsed.data.includeLlm) {
      const llmModel = parsed.data.model?.trim() || DEFAULT_REVIEW_MODEL;
      llmModelUsed = llmModel;
      const reviewPrompt =
        `You are a strict code reviewer for conventions and linting.\n` +
        `Return ONLY JSON as an array of findings.\n` +
        `Each finding object must have: severity (error|warning|info), category, message, optional line, optional column, optional rule.\n` +
        `Avoid duplicates of obvious syntax errors.\n` +
        `Language: ${language}\n` +
        `File path: ${filePath}\n` +
        `Code:\n${parsed.data.content}`;

      try {
        const rawLlmResponse = await withTimeout(
          generate(reviewPrompt, {
            model: llmModel,
            stream: false,
            format: "json",
            options: {
              num_predict: 600,
              temperature: 0.15,
            },
          }),
          endpointTimeoutMs["lint-conventions"],
          "lint-conventions",
        );
        const parsedLlmResponse = JSON.parse(rawLlmResponse);
        const asArray = Array.isArray(parsedLlmResponse)
          ? parsedLlmResponse
          : Array.isArray(parsedLlmResponse.findings)
            ? parsedLlmResponse.findings
            : [];
        llmFindings = asArray
          .map((finding: unknown) => normalizeLlmFinding(finding))
          .filter((finding: Finding | null): finding is Finding => finding !== null)
          .slice(0, parsed.data.maxFindings);
      } catch (error) {
        log.warn("lint_conventions_llm_enrichment_failed", {
          error: String(error),
        });
      }
    }

    const findings = [...deterministicFindings, ...llmFindings].slice(0, parsed.data.maxFindings);
    const summary = {
      total: findings.length,
      errors: findings.filter((item) => item.severity === "error").length,
      warnings: findings.filter((item) => item.severity === "warning").length,
      infos: findings.filter((item) => item.severity === "info").length,
      deterministicCount: deterministicFindings.length,
      llmCount: llmFindings.length,
    };

    response.json({
      requestId: randomUUID(),
      language,
      filePath,
      summary,
      findings,
      llmModelUsed,
      latencyMs: Date.now() - startedAt,
    });
  });

  application.post("/page-review", async (request, response) => {
    const clientAddress = resolveClientAddress(request);
    const retryAfterSeconds = enforceRateLimit("page-review", clientAddress);
    if (retryAfterSeconds !== null) {
      sendRateLimitedResponse(response, retryAfterSeconds);
      return;
    }

    const parsed = pageReviewSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        error: "Invalid request body",
        details: parsed.error.flatten(),
      });
      return;
    }

    const startedAt = Date.now();
    const requestId = randomUUID();
    const filePath = parsed.data.filePath?.trim() ?? "in-memory";
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
      `Code:\n${parsed.data.content}`;

    try {
      const rawReview = await withTimeout(
        generate(prompt, {
          model,
          stream: false,
          format: "json",
          options: {
            num_predict: 1200,
            temperature: 0.2,
          },
        }),
        endpointTimeoutMs["page-review"],
        "page-review",
      );
      const categories = parsePageReviewBody(rawReview);
      response.json({
        requestId,
        model,
        language,
        filePath,
        categories,
        latencyMs: Date.now() - startedAt,
      });
    } catch (error) {
      log.error("page_review_failed", {
        error: String(error),
        language,
        filePath,
      });
      response.status(500).json({ error: String(error), requestId });
    }
  });
}
