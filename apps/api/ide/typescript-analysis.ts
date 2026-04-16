/**
 * TypeScript compiler and deterministic convention analysis for IDE endpoints.
 *
 * Provides:
 * - `getTypeScriptFindings` — in-memory TS compiler diagnostics.
 * - `getConventionFindings` — line-by-line style/convention checks.
 * - `normalizeLlmFinding`  — coerce a raw LLM object into a Finding.
 * - `normalizePageReviewSuggestion` — coerce a raw LLM object into a suggestion.
 * - `parsePageReviewBody`  — parse the whole-file LLM review JSON response.
 *
 * Language helpers (`isTypeScriptLike`, `isJavaScriptLike`, `inferLanguage`)
 * are re-exported from `@/packages/shared`.
 *
 * @module apps/api/ide/typescript-analysis
 */

import ts from "typescript";
import { isTypeScriptLike, isJavaScriptLike } from "@/packages/shared";

export { isTypeScriptLike, isJavaScriptLike };

/** Severity levels for lint/convention findings. */
export type FindingSeverity = "error" | "warning" | "info";

/** Origin of a finding: TypeScript compiler, convention rule, or LLM review. */
export type FindingSource = "typescript" | "convention" | "llm";

/**
 * A single lint/review finding reported to the client.
 *
 * Findings from all three sources (TypeScript, conventions, LLM) share
 * this shape so the IDE can render them uniformly.
 */
export interface IFinding {
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

/** A single review suggestion with a title, detail, and priority. */
export interface ICategorizedSuggestion {
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
export interface IPageReviewResponseBody {
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
 * Run the TypeScript compiler on the given source code and return
 * diagnostics as `IFinding` objects.
 *
 * Uses `ts.transpileModule` for a fast, in-memory compile without
 * needing a full project `tsconfig.json`.  TypeScript files get
 * strict mode; JavaScript files get `allowJs` with no type checking.
 *
 * @param content  - The source code to compile.
 * @param filePath - Virtual file name for diagnostics.
 * @param language - Language identifier (determines compiler options).
 * @returns An array of `IFinding` objects extracted from TS diagnostics.
 */
export function getTypeScriptFindings(
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
 * @returns An array of `IFinding` objects for style/convention violations.
 */
export function getConventionFindings(content: string, language: string): IFinding[] {
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
 * function coerces the candidate into a well-formed `IFinding` or
 * returns `null` if it cannot be salvaged.
 *
 * @param candidate - Raw value from the LLM JSON response.
 * @returns A normalised `IFinding`, or `null` if the candidate is invalid.
 */
export function normalizeLlmFinding(candidate: unknown): IFinding | null {
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
 * @returns A normalised `ICategorizedSuggestion`, or `null` if invalid.
 */
export function normalizePageReviewSuggestion(candidate: unknown): ICategorizedSuggestion | null {
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
 * Parse the raw LLM JSON string into an `IPageReviewResponseBody`.
 *
 * Tolerates malformed JSON by returning an empty fallback.  Each
 * category array is individually validated and capped at 12 items.
 *
 * @param raw - Raw JSON string from the LLM.
 * @returns A fully-formed `IPageReviewResponseBody` (may have empty arrays).
 */
export function parsePageReviewBody(raw: string): IPageReviewResponseBody {
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
