import { generate } from "../llm/ollama";

export type ModelProfile = "fast" | "reasoning" | "code" | "default";

export interface ModelRouteDecision {
  profile: ModelProfile;
  model: string;
  reason: string;
  options?: Record<string, unknown>;
}

interface RouteInput {
  task: string;
  context: string;
  step: number;
  /** When set, skip all routing logic and use this profile directly. */
  forcedProfile?: ModelProfile;
}

const DEFAULT_MODEL = process.env.AGENT_MODEL_DEFAULT ?? process.env.OLLAMA_MODEL ?? "llama3";
const FAST_MODEL = process.env.AGENT_MODEL_FAST ?? DEFAULT_MODEL;
const REASONING_MODEL = process.env.AGENT_MODEL_REASONING ?? DEFAULT_MODEL;
const CODE_MODEL = process.env.AGENT_MODEL_CODE ?? DEFAULT_MODEL;
const ROUTER_MODEL = process.env.AGENT_MODEL_ROUTER_MODEL ?? "phi4-mini:latest";
const ROUTER_MODE = (process.env.AGENT_MODEL_ROUTER_MODE ?? "rules").toLowerCase();

function envFloat(value: string | undefined, fallback: number): number {
  const parsed = parseFloat(value ?? String(fallback));
  return Number.isNaN(parsed) ? fallback : parsed;
}

function envInt(value: string | undefined, fallback: number): number {
  const parsed = parseInt(value ?? String(fallback), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function resolveModel(profile: ModelProfile): string {
  switch (profile) {
    case "fast":
      return FAST_MODEL;
    case "reasoning":
      return REASONING_MODEL;
    case "code":
      return CODE_MODEL;
    default:
      return DEFAULT_MODEL;
  }
}

function resolveOptions(profile: ModelProfile): Record<string, unknown> {
  const prefix = `AGENT_MODEL_${profile.toUpperCase()}`;
  switch (profile) {
    case "fast":
      return {
        temperature: envFloat(process.env[`${prefix}_TEMPERATURE`], 0.3),
        top_p: envFloat(process.env[`${prefix}_TOP_P`], 0.85),
        top_k: envInt(process.env[`${prefix}_TOP_K`], 30),
        num_ctx: envInt(process.env[`${prefix}_NUM_CTX`], 4096),
        repeat_penalty: envFloat(process.env[`${prefix}_REPEAT_PENALTY`], 1.2),
      };
    case "reasoning":
      return {
        temperature: envFloat(process.env[`${prefix}_TEMPERATURE`], 0.2),
        top_p: envFloat(process.env[`${prefix}_TOP_P`], 0.8),
        top_k: envInt(process.env[`${prefix}_TOP_K`], 20),
        num_ctx: envInt(process.env[`${prefix}_NUM_CTX`], 8192),
        repeat_penalty: envFloat(process.env[`${prefix}_REPEAT_PENALTY`], 1.3),
      };
    case "code":
      return {
        temperature: envFloat(process.env[`${prefix}_TEMPERATURE`], 0.2),
        top_p: envFloat(process.env[`${prefix}_TOP_P`], 0.8),
        top_k: envInt(process.env[`${prefix}_TOP_K`], 20),
        num_ctx: envInt(process.env[`${prefix}_NUM_CTX`], 8192),
        repeat_penalty: envFloat(process.env[`${prefix}_REPEAT_PENALTY`], 1.3),
      };
    default:
      return {
        temperature: envFloat(process.env[`${prefix}_TEMPERATURE`], 0.3),
        top_p: envFloat(process.env[`${prefix}_TOP_P`], 0.85),
        top_k: envInt(process.env[`${prefix}_TOP_K`], 30),
        num_ctx: envInt(process.env[`${prefix}_NUM_CTX`], 8192),
        repeat_penalty: envFloat(process.env[`${prefix}_REPEAT_PENALTY`], 1.2),
      };
  }
}

function routeWithRules(input: RouteInput): ModelRouteDecision {
  const text = `${input.task}\n${input.context}`.toLowerCase();

  const codeSignals = [
    "code",
    "refactor",
    "debug",
    "bug",
    "typescript",
    "javascript",
    "python",
    "golang",
    "java",
    "function",
    "class",
    "test",
    "compile",
    "stack trace",
    "repository",
    "commit",
    "pull request",
    "api",
    "sql",
  ];

  if (codeSignals.some((s) => text.includes(s))) {
    return {
      profile: "code",
      model: resolveModel("code"),
      reason: "keyword_match:code",
      options: resolveOptions("code"),
    };
  }

  const reasoningSignals = [
    "reason",
    "step by step",
    "prove",
    "analyze",
    "compare",
    "tradeoff",
    "mathemat",
    "logic",
    "why",
    "multi-step",
    "design",
    "architecture",
  ];

  if (
    reasoningSignals.some((s) => text.includes(s)) ||
    input.task.length > 280 ||
    input.step >= 2
  ) {
    return {
      profile: "reasoning",
      model: resolveModel("reasoning"),
      reason: "heuristic:reasoning_or_long_task",
      options: resolveOptions("reasoning"),
    };
  }

  return {
    profile: "fast",
    model: resolveModel("fast"),
    reason: "default_fast",
    options: resolveOptions("fast"),
  };
}

function parseProfile(raw: string): ModelProfile | null {
  const value = raw.trim().toLowerCase();
  if (value === "fast" || value === "reasoning" || value === "code" || value === "default") {
    return value;
  }
  return null;
}

async function routeWithModel(input: RouteInput): Promise<ModelRouteDecision> {
  const routerPrompt =
    `You are a model router.\n` +
    `Select exactly one profile: fast, reasoning, code, default.\n` +
    `Rules:\n` +
    `- Use code for coding/refactor/debug/repo/dev tasks.\n` +
    `- Use reasoning for hard logic, architecture, multi-step analysis.\n` +
    `- Use fast for simple Q&A.\n` +
    `- Use default only when uncertain.\n` +
    `Respond ONLY with JSON: {"profile":"fast|reasoning|code|default","reason":"short reason"}\n\n` +
    `Task:\n${input.task}\n\n` +
    `Context:\n${input.context.slice(-2000)}`;

  const response = await generate(routerPrompt, {
    model: ROUTER_MODEL,
    stream: false,
    format: "json",
  });

  const cleaned = response.replace(/```(?:json)?\n?/g, "").trim();
  const parsed = JSON.parse(cleaned) as { profile?: string; reason?: string };
  const profile = parsed.profile ? parseProfile(parsed.profile) : null;
  if (!profile) {
    throw new Error(`Router returned invalid profile: ${String(parsed.profile)}`);
  }

  return {
    profile,
    model: resolveModel(profile),
    reason: parsed.reason?.slice(0, 240) ?? "router_model_decision",
    options: resolveOptions(profile),
  };
}

export async function routeModel(input: RouteInput): Promise<ModelRouteDecision> {
  if (input.forcedProfile) {
    return {
      profile: input.forcedProfile,
      model: resolveModel(input.forcedProfile),
      reason: "forced_by_caller",
      options: resolveOptions(input.forcedProfile),
    };
  }

  if (ROUTER_MODE !== "model") {
    return routeWithRules(input);
  }

  try {
    return await routeWithModel(input);
  } catch {
    return {
      profile: "default",
      model: resolveModel("default"),
      reason: "router_model_failed_fallback_default",
      options: resolveOptions("default"),
    };
  }
}
