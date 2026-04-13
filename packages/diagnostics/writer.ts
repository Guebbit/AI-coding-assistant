/**
 * Diagnostic log writer — persists agent run diagnostics as human-readable Markdown files.
 *
 * Each call to `writeDiagnosticLog` writes one self-contained Markdown file to
 * `DIAGNOSTIC_LOG_DIR` (default `data/diagnostics`).  The filename encodes the
 * timestamp and a short slug derived from the task so that files are easy to
 * sort and identify in a file browser.
 *
 * File format:
 * ```
 * # Diagnostic Report — [timestamp]
 * ## Task
 * ## Outcome
 * ## Timeline
 * ## Errors Encountered
 * ## AI Commentary
 * ## Suggestions
 * ## Raw Context  (collapsed <details> block)
 * ```
 *
 * Cleanup: when the file count in the directory exceeds `DIAGNOSTIC_LOG_MAX_FILES`
 * (default `100`), the oldest files are deleted automatically.
 *
 * @module diagnostics/writer
 */

import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";
import { envInt } from "../shared";
import { getLogger } from "../logger/logger";
import type { DiagnosticEntry } from "./types";

const log = getLogger("diagnostics");

/* ── Configuration ───────────────────────────────────────────────────── */

/**
 * Directory where diagnostic Markdown files are written.
 * Resolved to an absolute path at module load time to prevent any
 * path-traversal manipulation through the environment variable.
 * Configurable via `DIAGNOSTIC_LOG_DIR` env var.
 */
const DIAGNOSTIC_LOG_DIR = resolve(process.env.DIAGNOSTIC_LOG_DIR ?? "data/diagnostics");

/**
 * Whether diagnostic logging is enabled at all.
 * Set `DIAGNOSTIC_LOG_ENABLED=false` to disable writes entirely.
 */
const DIAGNOSTIC_LOG_ENABLED =
  (process.env.DIAGNOSTIC_LOG_ENABLED ?? "true").toLowerCase() !== "false";

/**
 * Maximum number of diagnostic files to keep.
 * When exceeded, the oldest files are deleted.
 * Configurable via `DIAGNOSTIC_LOG_MAX_FILES` env var.
 */
const DIAGNOSTIC_LOG_MAX_FILES = envInt(process.env.DIAGNOSTIC_LOG_MAX_FILES, 100);

/* ── Internal helpers ────────────────────────────────────────────────── */

/**
 * Derive a short, filesystem-safe slug from an arbitrary string.
 *
 * Lowercases the input, replaces non-alphanumeric characters with hyphens,
 * collapses consecutive hyphens, strips leading/trailing hyphens, and
 * truncates to `maxLength` characters.
 *
 * @param text      - The source string (typically the task description).
 * @param maxLength - Maximum character length of the resulting slug.
 * @returns A slug suitable for use as part of a filename.
 */
function toSlug(text: string, maxLength = 40): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, maxLength)
    .replace(/-$/, "");
}

/**
 * Format an ISO 8601 timestamp string into a filename-safe prefix.
 *
 * Converts `"2024-07-15T14:30:05.123Z"` to `"2024-07-15T14-30-05"`.
 *
 * Callers must ensure `iso` is a valid ISO 8601 string (at least 19 chars).
 * In this module `entry.timestamp` is always set to `new Date().toISOString()`,
 * which always produces a valid string with length ≥ 24.
 *
 * @param iso - An ISO 8601 timestamp string.
 * @returns A filesystem-safe date-time string (colons replaced with hyphens).
 */
function isoToFileSafe(iso: string): string {
  return iso.slice(0, 19).replace(/:/g, "-");
}

/**
 * Render a `DiagnosticEntry` as a Markdown document.
 *
 * The resulting string is a self-contained, human-readable report that
 * covers the full run timeline, all errors, AI commentary, and a
 * collapsible section with the raw accumulated context.
 *
 * @param entry - The diagnostic data to render.
 * @returns A fully formed Markdown string.
 */
function renderMarkdown(entry: DiagnosticEntry): string {
  const lines: string[] = [];

  lines.push(`# Diagnostic Report — ${entry.timestamp}`, "");
  lines.push(`## Task`, "", entry.task, "");

  lines.push(
    `## Outcome`,
    "",
    `**${entry.outcome.replace(/_/g, " ")}** — ${entry.stepsCompleted} step(s) executed.`,
    "",
  );

  if (entry.failureReason) {
    lines.push(`**Failure reason:** ${entry.failureReason}`, "");
  }

  /* ── Timeline ──────────────────────────────────────────────────────── */
  lines.push(`## Timeline`, "");
  if (entry.timeline.length === 0) {
    lines.push("_No steps recorded._", "");
  } else {
    for (const t of entry.timeline) {
      const statusBadge =
        t.status === "success" || t.status === "none"
          ? `✅ ${t.status}`
          : `**❌ ${t.status}**`;
      const detail = t.detail ? ` — ${t.detail}` : "";
      lines.push(
        `- Step ${t.step}: routed to \`${t.profile}\` profile → action \`${t.action}\` → ${statusBadge} (${t.durationMs}ms)${detail}`,
      );
    }
    lines.push("");
  }

  /* ── Errors ────────────────────────────────────────────────────────── */
  lines.push(`## Errors Encountered`, "");
  if (entry.errors.length === 0) {
    lines.push("_No errors recorded._", "");
  } else {
    for (const e of entry.errors) {
      lines.push(`- Step ${e.step}: \`${e.type}\` — ${e.detail}`);
    }
    lines.push("");
  }

  /* ── AI Commentary ─────────────────────────────────────────────────── */
  lines.push(`## AI Commentary`, "");
  lines.push(entry.aiCommentary ?? "_No AI commentary available._", "");

  /* ── Suggestions ───────────────────────────────────────────────────── */
  lines.push(`## Suggestions`, "");
  lines.push(entry.suggestion ?? "_No suggestions available._", "");

  /* ── Tools used ────────────────────────────────────────────────────── */
  if (entry.toolsUsed.length > 0) {
    lines.push(`## Tools Used`, "");
    lines.push(entry.toolsUsed.map((t) => `- \`${t}\``).join("\n"), "");
  }

  /* ── Raw context (collapsible) ─────────────────────────────────────── */
  lines.push(`## Raw Context`, "");
  lines.push(
    `<details>`,
    `<summary>Click to expand raw accumulated context</summary>`,
    "",
    "```",
    entry.contextSnapshot || "(empty)",
    "```",
    "",
    `</details>`,
    "",
  );

  return lines.join("\n");
}

/**
 * Enforce the maximum file limit in the diagnostics directory.
 *
 * Reads all `.md` files from `dir`, sorts them by name (oldest first,
 * since filenames start with ISO timestamps), and deletes excess files
 * until the count is below `maxFiles`.
 *
 * Errors during cleanup are logged but do not propagate — a failed
 * cleanup must never block writing a new diagnostic file.
 *
 * @param dir      - The diagnostics directory path.
 * @param maxFiles - The maximum number of files to keep.
 */
async function enforceFileLimit(dir: string, maxFiles: number): Promise<void> {
  try {
    const entries = await readdir(dir);
    const mdFiles = entries.filter((f) => f.endsWith(".md")).sort();

    if (mdFiles.length <= maxFiles) {
      return;
    }

    const excess = mdFiles.slice(0, mdFiles.length - maxFiles);
    for (const file of excess) {
      /* Use basename() to strip any accidental path separators, then
       * resolve + validate that the final path is within `dir`.
       * This prevents traversal even if a future platform quirk produces
       * unexpected filenames from readdir. */
      const safeFilename = basename(file);
      if (!safeFilename || !safeFilename.endsWith(".md")) {
        continue;
      }
      const resolvedPath = resolve(join(dir, safeFilename));
      const resolvedDir = resolve(dir);
      if (!resolvedPath.startsWith(resolvedDir + sep)) {
        log.warn("diagnostic_cleanup_path_outside_dir", { file: safeFilename });
        continue;
      }
      await unlink(resolvedPath).catch((e) => {
        log.warn("diagnostic_cleanup_failed", { file: safeFilename, error: String(e) });
      });
    }
    log.info("diagnostic_cleanup_done", { deleted: excess.length, remaining: maxFiles });
  } catch (e) {
    log.warn("diagnostic_cleanup_error", { error: String(e) });
  }
}

/* ── Public API ──────────────────────────────────────────────────────── */

/**
 * Write a `DiagnosticEntry` as a Markdown file to the diagnostics directory.
 *
 * Filename format: `YYYY-MM-DDTHH-mm-ss_<slug>.md`
 * where `<slug>` is derived from the task description (max 40 chars, filesystem-safe).
 *
 * This function is a no-op when `DIAGNOSTIC_LOG_ENABLED` is `"false"`.
 * Errors during writing are logged but do not propagate — a failed
 * diagnostic write must never crash the agent.
 *
 * @param entry - The diagnostic data to persist.
 */
export async function writeDiagnosticLog(entry: DiagnosticEntry): Promise<void> {
  if (!DIAGNOSTIC_LOG_ENABLED) {
    return;
  }

  try {
    await mkdir(DIAGNOSTIC_LOG_DIR, { recursive: true });

    const datePrefix = isoToFileSafe(entry.timestamp);
    const slug = toSlug(entry.task);
    const filename = `${datePrefix}_${slug}.md`;
    const filepath = join(DIAGNOSTIC_LOG_DIR, filename);

    const markdown = renderMarkdown(entry);
    await writeFile(filepath, markdown, "utf8");

    log.info("diagnostic_written", { filepath, outcome: entry.outcome });

    /* Enforce the file-count ceiling after writing. */
    await enforceFileLimit(DIAGNOSTIC_LOG_DIR, DIAGNOSTIC_LOG_MAX_FILES);
  } catch (e) {
    log.error("diagnostic_write_failed", { error: String(e) });
  }
}
