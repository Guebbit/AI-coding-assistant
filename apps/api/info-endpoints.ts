/**
 * Informational HTTP endpoints — lightweight, no LLM calls.
 *
 * These endpoints provide metadata about the Manna instance:
 * - `GET /info/modes`  — list available Manna agent routing profiles.
 * - `GET /info/models` — list models currently loaded in Ollama.
 * - `GET /help`        — human-readable overview of every REST API endpoint.
 *
 * None of these routes invoke the agent loop or make LLM calls.
 * They are registered on the Express app from `apps/api/index.ts`
 * via `registerInfoRoutes(app)`.
 *
 * @module apps/api/info-endpoints
 */

import type express from "express";
import { getLogger } from "../../packages/logger/logger";
import { rejectResponse, successResponse } from "../../packages/shared";
import { VALID_PROFILES } from "./agents";

const log = getLogger("api-info");

/* ── Constants ───────────────────────────────────────────────────────── */

/** Base URL for the Ollama REST API. */
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";

/* ── Mode / profile metadata ─────────────────────────────────────────── */

/**
 * Human-readable description of each Manna routing profile.
 *
 * Keyed by `ModelProfile` string; each entry explains when and why
 * that profile is selected.
 */
const MODE_DESCRIPTIONS: Record<string, string> = {
  fast: "Low-latency model for simple, quick tasks. Fully GPU-resident for sub-second response.",
  reasoning:
    "Larger model optimised for multi-step reasoning, analysis, and complex logic. Uses a wider context window.",
  code: "Code-specialised model (e.g. Qwen-Coder) for coding, refactoring, debugging, and repository tasks.",
  default:
    "General-purpose fallback model used when no profile-specific signal is detected by the router.",
};

/**
 * Return the environment variable that configures the Ollama model for
 * a given profile, along with its current resolved value.
 *
 * @param profile - Profile name.
 * @returns `{ envVar, model }` pair.
 */
function resolveProfileModel(profile: string): { envVar: string; model: string } {
  const fallback = process.env.AGENT_MODEL_DEFAULT ?? process.env.OLLAMA_MODEL ?? "llama3";

  switch (profile) {
    case "fast":
      return {
        envVar: "AGENT_MODEL_FAST",
        model: process.env.AGENT_MODEL_FAST ?? fallback,
      };
    case "reasoning":
      return {
        envVar: "AGENT_MODEL_REASONING",
        model: process.env.AGENT_MODEL_REASONING ?? fallback,
      };
    case "code":
      return {
        envVar: "AGENT_MODEL_CODE",
        model: process.env.AGENT_MODEL_CODE ?? fallback,
      };
    default:
      return {
        envVar: "AGENT_MODEL_DEFAULT",
        model: fallback,
      };
  }
}

/* ── Help catalogue ──────────────────────────────────────────────────── */

/**
 * A single entry in the `GET /help` response.
 *
 * Deliberately terse — this is the `--help` equivalent, not full docs.
 */
interface IHelpEntry {
  /** HTTP method. */
  method: string;
  /** URL path. */
  path: string;
  /** One-line summary. */
  summary: string;
  /** Request body fields (empty array for GET endpoints). */
  params: IHelpParameter[];
}

/**
 * A single request parameter described in the help output.
 */
interface IHelpParameter {
  /** Field name. */
  name: string;
  /** Expected type (e.g. `"string"`, `"boolean"`). */
  type: string;
  /** Whether the field is required. */
  required: boolean;
  /** Short description. */
  description: string;
}

/** Static help catalogue — kept in sync with the codebase manually. */
const HELP_CATALOGUE: IHelpEntry[] = [
  /* ── Core ──────────────────────────────────────────────────────────── */
  {
    method: "GET",
    path: "/health",
    summary: "Liveness check — returns { status, timestamp }. No LLM call.",
    params: [],
  },
  {
    method: "POST",
    path: "/run",
    summary: "Submit a task to the full agentic loop (reasoning → tool selection → execution).",
    params: [
      { name: "task", type: "string", required: true, description: "Natural-language task." },
      {
        name: "allowWrite",
        type: "boolean",
        required: false,
        description: "Enable write tools (write_file, scaffold_project, document_ingest).",
      },
      {
        name: "profile",
        type: '"fast" | "reasoning" | "code" | "default"',
        required: false,
        description: "Force a model profile, bypassing automatic routing.",
      },
    ],
  },
  {
    method: "POST",
    path: "/run/stream",
    summary: "Same as POST /run but streams agent events via Server-Sent Events (SSE).",
    params: [
      { name: "task", type: "string", required: true, description: "Natural-language task." },
      {
        name: "allowWrite",
        type: "boolean",
        required: false,
        description: "Enable write tools.",
      },
      {
        name: "profile",
        type: '"fast" | "reasoning" | "code" | "default"',
        required: false,
        description: "Force a model profile.",
      },
    ],
  },

  /* ── IDE direct ────────────────────────────────────────────────────── */
  {
    method: "POST",
    path: "/autocomplete",
    summary: "IDE cursor-time code completion (single LLM call, cached).",
    params: [
      { name: "prefix", type: "string", required: true, description: "Code before the cursor." },
      {
        name: "suffix",
        type: "string",
        required: false,
        description: "Code after the cursor (fill-in-the-middle).",
      },
      {
        name: "language",
        type: "string",
        required: false,
        description: 'Language hint, e.g. "typescript".',
      },
    ],
  },
  {
    method: "POST",
    path: "/lint-conventions",
    summary: "Deterministic TS lint + LLM convention findings.",
    params: [
      { name: "code", type: "string", required: true, description: "Source code to analyse." },
      { name: "language", type: "string", required: false, description: "Language hint." },
    ],
  },
  {
    method: "POST",
    path: "/page-review",
    summary: "Full-file categorised engineering review (single LLM call).",
    params: [
      { name: "code", type: "string", required: true, description: "Full source file." },
      { name: "language", type: "string", required: false, description: "Language hint." },
      { name: "filename", type: "string", required: false, description: "File name hint." },
    ],
  },

  /* ── Upload ────────────────────────────────────────────────────────── */
  {
    method: "POST",
    path: "/upload/image-classify",
    summary: "Classify/describe an uploaded image (multipart/form-data).",
    params: [
      { name: "file", type: "file", required: true, description: "Image file." },
      { name: "prompt", type: "string", required: false, description: "Custom prompt." },
      { name: "model", type: "string", required: false, description: "Override vision model." },
    ],
  },
  {
    method: "POST",
    path: "/upload/speech-to-text",
    summary: "Transcribe an uploaded audio file (multipart/form-data).",
    params: [
      { name: "file", type: "file", required: true, description: "Audio file." },
      { name: "model", type: "string", required: false, description: "Override STT model." },
      { name: "language", type: "string", required: false, description: "Language hint." },
      { name: "prompt", type: "string", required: false, description: "Custom prompt." },
    ],
  },
  {
    method: "POST",
    path: "/upload/read-pdf",
    summary: "Extract text from an uploaded PDF (multipart/form-data).",
    params: [{ name: "file", type: "file", required: true, description: "PDF file." }],
  },

  /* ── Info ───────────────────────────────────────────────────────────── */
  {
    method: "GET",
    path: "/info/modes",
    summary: "List available Manna agent routing profiles (modes) and their configuration.",
    params: [],
  },
  {
    method: "GET",
    path: "/info/models",
    summary: "List models currently available in the connected Ollama instance.",
    params: [],
  },
  {
    method: "GET",
    path: "/help",
    summary: "This endpoint — returns a structured overview of all available REST API endpoints.",
    params: [],
  },
];

/* ── Route registration ──────────────────────────────────────────────── */

/**
 * Register informational routes on the Express application.
 *
 * Called once from `apps/api/index.ts` at startup.  Attaches:
 * - `GET /info/modes`
 * - `GET /info/models`
 * - `GET /help`
 *
 * @param application - The Express app instance to register routes on.
 */
export function registerInfoRoutes(application: express.Express): void {
  /* ── GET /info/modes ────────────────────────────────────────────── */

  application.get("/info/modes", (_request, response) => {
    log.info("info_modes_requested");

    const modes = [...VALID_PROFILES].map((profile) => {
      const { envVar, model } = resolveProfileModel(profile);
      return {
        profile,
        model,
        envVar,
        description: MODE_DESCRIPTIONS[profile] ?? "",
      };
    });

    successResponse(response, {
      count: modes.length,
      modes,
    });
  });

  /* ── GET /info/models ───────────────────────────────────────────── */

  application.get("/info/models", (_request, response) => {
    log.info("info_models_requested");

    fetch(`${OLLAMA_BASE_URL}/api/tags`)
      .then((ollamaResponse) => {
        if (!ollamaResponse.ok) {
          return ollamaResponse
            .text()
            .catch(() => "")
            .then((body) => {
              log.error("ollama_tags_failed", {
                status: ollamaResponse.status,
                body: body.slice(0, 500),
              });
              rejectResponse(response, 502, "Bad Gateway", [`Ollama API returned ${ollamaResponse.status}`]);
              return null;
            });
        }

        return ollamaResponse.json() as Promise<{ models?: Array<Record<string, unknown>> }>;
      })
      .then((data) => {
        if (!data) return;

        const models = (data.models ?? []).map((model) => ({
          name: (model.name as string) ?? (model.model as string) ?? "unknown",
          size: (model.size as number) ?? null,
          digest: (model.digest as string) ?? null,
          modifiedAt: (model.modified_at as string) ?? null,
          details: (model.details as Record<string, unknown>) ?? null,
        }));

        successResponse(response, {
          count: models.length,
          ollamaBaseUrl: OLLAMA_BASE_URL,
          models,
        });
      })
      .catch((error: unknown) => {
        if (response.headersSent) return;
        log.error("info_models_failed", { error: String(error) });
        rejectResponse(response, 502, "Bad Gateway", [
          `Failed to reach Ollama at ${OLLAMA_BASE_URL}: ${String(error)}`,
        ]);
      });
  });

  /* ── GET /help ──────────────────────────────────────────────────── */

  application.get("/help", (_request, response) => {
    log.info("help_requested");
    successResponse(response, {
      description: "Manna AI Agent Platform — REST API quick reference",
      endpointCount: HELP_CATALOGUE.length,
      endpoints: HELP_CATALOGUE,
    });
  });
}
