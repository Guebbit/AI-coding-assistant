/**
 * Model router — selects the best Ollama model for each agent step.
 *
 * Two routing strategies are supported, toggled by the
 * `AGENT_MODEL_ROUTER_MODE` environment variable:
 *
 * 1. **`rules`** (default) — fast, synchronous keyword scan of the
 *    task + accumulated context.  Zero LLM cost.
 * 2. **`model`** — delegates the routing decision to a small, fast
 *    LLM (`AGENT_MODEL_ROUTER_MODEL`).  Falls back to the `default`
 *    profile on failure.
 *
 * A caller may also *force* a profile via `RouteInput.forcedProfile`,
 * which bypasses all routing logic entirely.
 *
 * @module agent/model-router
 */

import { generate } from '../llm/ollama';
import { envFloat, envInt } from '../shared';

/* ── Budget environment variables ────────────────────────────────────── */

/**
 * Maximum allowed wall-clock duration (ms) for a single agent run.
 * When cumulative duration exceeds 70 % of this value the router
 * downgrades to the `fast` profile to finish quickly.
 */
const BUDGET_MAX_DURATION_MS = envInt(process.env.AGENT_BUDGET_MAX_DURATION_MS, 60_000);

/**
 * Maximum allowed context string length (chars) for a single agent run.
 * When context length exceeds 80 % of this value the router upgrades to
 * the `reasoning` profile which uses a larger `num_ctx`.
 */
const BUDGET_MAX_CONTEXT_CHARS = envInt(process.env.AGENT_BUDGET_MAX_CONTEXT_CHARS, 50_000);

/**
 * Context length fraction at which the router upgrades to the `reasoning`
 * profile (which has a larger `num_ctx`).
 */
const BUDGET_CONTEXT_THRESHOLD = 0.8;

/**
 * Elapsed-duration fraction at which the router downgrades to the `fast`
 * profile so the run can finish quickly within the allowed wall-clock time.
 */
const BUDGET_DURATION_THRESHOLD = 0.7;

/* ── Public types ────────────────────────────────────────────────────── */

/** Supported model profiles — each maps to a distinct Ollama model. */
export type ModelProfile = 'fast' | 'reasoning' | 'code' | 'default';

/** The decision returned by `routeModel`. */
export interface IModelRouteDecision {
    /** The selected profile name. */
    profile: ModelProfile;

    /** Ollama model identifier resolved from the profile. */
    model: string;

    /** Short human-readable reason for the routing decision. */
    reason: string;

    /** Optional generation options (temperature, top_p, etc.) for this profile. */
    options?: Record<string, unknown>;
}

/* ── Internal types ──────────────────────────────────────────────────── */

/**
 * Input consumed by the routing functions.
 *
 * The agent constructs this object at every step so the router can
 * make context-aware decisions.
 */
interface IRouteInput {
    /** The original task description from the user. */
    task: string;

    /** Accumulated context built up by previous agent steps. */
    context: string;

    /** Current zero-based step index in the agent loop. */
    step: number;

    /**
     * When set, skip all routing logic and use this profile directly.
     * This is how the `/run` endpoint's `profile` query-param works.
     */
    forcedProfile?: ModelProfile;

    /**
     * Current context length in characters, used by budget-aware routing
     * to upgrade to a larger-context profile when approaching the ceiling.
     */
    contextLength?: number;

    /**
     * Wall-clock milliseconds elapsed since the agent run started, used
     * by budget-aware routing to downgrade to `fast` when time is short.
     */
    cumulativeDurationMs?: number;
}

/* ── Resolved model names from environment ───────────────────────────── */

/** Fallback model used when no profile-specific model is configured. */
const DEFAULT_MODEL = process.env.AGENT_MODEL_DEFAULT ?? process.env.OLLAMA_MODEL ?? 'llama3';

/** Low-latency model for simple / quick tasks. */
const FAST_MODEL = process.env.AGENT_MODEL_FAST ?? DEFAULT_MODEL;

/** Larger model optimised for multi-step reasoning. */
const REASONING_MODEL = process.env.AGENT_MODEL_REASONING ?? DEFAULT_MODEL;

/** Code-specialised model (Qwen-Coder, DeepSeek-Coder, etc.). */
const CODE_MODEL = process.env.AGENT_MODEL_CODE ?? DEFAULT_MODEL;

/** Small, fast model used by the *model* routing strategy to classify tasks. */
const ROUTER_MODEL = process.env.AGENT_MODEL_ROUTER_MODEL ?? 'phi4-mini:latest';

/** Active routing strategy: `"rules"` (default) or `"model"`. */
const ROUTER_MODE = (process.env.AGENT_MODEL_ROUTER_MODE ?? 'rules').toLowerCase();

/* ── Profile → model / options resolution ────────────────────────────── */

/**
 * Map a profile name to its configured Ollama model string.
 *
 * @param profile - One of the four supported profiles.
 * @returns The model identifier to pass to Ollama.
 */
function resolveModel(profile: ModelProfile): string {
    switch (profile) {
        case 'fast':
            return FAST_MODEL;
        case 'reasoning':
            return REASONING_MODEL;
        case 'code':
            return CODE_MODEL;
        default:
            return DEFAULT_MODEL;
    }
}

/**
 * Build profile-specific generation options (temperature, top_p, etc.).
 *
 * Each profile reads its own set of environment variables with a
 * naming convention of `AGENT_MODEL_<PROFILE>_<OPTION>` and falls back
 * to sensible defaults tuned for that profile's purpose.
 *
 * @param profile - The profile to build options for.
 * @returns A plain object forwarded to Ollama's `options` field.
 */
function resolveOptions(profile: ModelProfile): Record<string, unknown> {
    const prefix = `AGENT_MODEL_${profile.toUpperCase()}`;
    switch (profile) {
        case 'fast':
            return {
                temperature: envFloat(process.env[`${prefix}_TEMPERATURE`], 0.3),
                top_p: envFloat(process.env[`${prefix}_TOP_P`], 0.85),
                top_k: envInt(process.env[`${prefix}_TOP_K`], 30),
                num_ctx: envInt(process.env[`${prefix}_NUM_CTX`], 4096),
                repeat_penalty: envFloat(process.env[`${prefix}_REPEAT_PENALTY`], 1.2)
            };
        case 'reasoning':
            return {
                temperature: envFloat(process.env[`${prefix}_TEMPERATURE`], 0.2),
                top_p: envFloat(process.env[`${prefix}_TOP_P`], 0.8),
                top_k: envInt(process.env[`${prefix}_TOP_K`], 20),
                num_ctx: envInt(process.env[`${prefix}_NUM_CTX`], 8192),
                repeat_penalty: envFloat(process.env[`${prefix}_REPEAT_PENALTY`], 1.3)
            };
        case 'code':
            return {
                temperature: envFloat(process.env[`${prefix}_TEMPERATURE`], 0.2),
                top_p: envFloat(process.env[`${prefix}_TOP_P`], 0.8),
                top_k: envInt(process.env[`${prefix}_TOP_K`], 20),
                num_ctx: envInt(process.env[`${prefix}_NUM_CTX`], 8192),
                repeat_penalty: envFloat(process.env[`${prefix}_REPEAT_PENALTY`], 1.3)
            };
        default:
            return {
                temperature: envFloat(process.env[`${prefix}_TEMPERATURE`], 0.3),
                top_p: envFloat(process.env[`${prefix}_TOP_P`], 0.85),
                top_k: envInt(process.env[`${prefix}_TOP_K`], 30),
                num_ctx: envInt(process.env[`${prefix}_NUM_CTX`], 8192),
                repeat_penalty: envFloat(process.env[`${prefix}_REPEAT_PENALTY`], 1.2)
            };
    }
}

/* ── Rule-based routing ──────────────────────────────────────────────── */

/**
 * Select a model profile using simple keyword matching on the task + context.
 *
 * Budget-aware heuristics take precedence over keyword heuristics:
 * - When context length exceeds 80 % of `AGENT_BUDGET_MAX_CONTEXT_CHARS`,
 *   the `reasoning` profile (larger `num_ctx`) is selected.
 * - When cumulative duration exceeds 70 % of `AGENT_BUDGET_MAX_DURATION_MS`,
 *   the `fast` profile is selected to finish quickly.
 *
 * The heuristic then checks for code-related keywords first, then reasoning
 * signals, and defaults to the `fast` profile when nothing matches.
 * This is cheap (no LLM call) and deterministic.
 *
 * @param input - The current routing input (task, context, step, budgets).
 * @returns A `ModelRouteDecision` based on budget and keyword heuristics.
 */
function routeWithRules(input: IRouteInput): IModelRouteDecision {
    /* ── Budget-aware heuristics (highest priority) ───────────────────── */

    const contextLen = input.contextLength ?? input.context.length;
    if (contextLen > BUDGET_MAX_CONTEXT_CHARS * BUDGET_CONTEXT_THRESHOLD) {
        return {
            profile: 'reasoning',
            model: resolveModel('reasoning'),
            reason: 'budget:context_near_ceiling',
            options: resolveOptions('reasoning')
        };
    }

    if (
        input.cumulativeDurationMs !== undefined &&
        input.cumulativeDurationMs > BUDGET_MAX_DURATION_MS * BUDGET_DURATION_THRESHOLD
    ) {
        return {
            profile: 'fast',
            model: resolveModel('fast'),
            reason: 'budget:duration_near_ceiling',
            options: resolveOptions('fast')
        };
    }

    /* ── Keyword heuristics ───────────────────────────────────────────── */

    const text = `${input.task}\n${input.context}`.toLowerCase();

    /* Keywords that indicate the task is code-centric. */
    const codeSignals = [
        'code',
        'refactor',
        'debug',
        'bug',
        'typescript',
        'javascript',
        'python',
        'golang',
        'java',
        'function',
        'class',
        'test',
        'compile',
        'stack trace',
        'repository',
        'commit',
        'pull request',
        'api',
        'sql'
    ];

    if (codeSignals.some((s) => text.includes(s))) {
        return {
            profile: 'code',
            model: resolveModel('code'),
            reason: 'keyword_match:code',
            options: resolveOptions('code')
        };
    }

    /* Keywords that indicate multi-step reasoning or analysis. */
    const reasoningSignals = [
        'reason',
        'step by step',
        'prove',
        'analyze',
        'compare',
        'tradeoff',
        'mathemat',
        'logic',
        'why',
        'multi-step',
        'design',
        'architecture'
    ];

    if (
        reasoningSignals.some((s) => text.includes(s)) ||
        input.task.length > 280 ||
        input.step >= 2
    ) {
        return {
            profile: 'reasoning',
            model: resolveModel('reasoning'),
            reason: 'heuristic:reasoning_or_long_task',
            options: resolveOptions('reasoning')
        };
    }

    /* Nothing matched — use the cheapest profile. */
    return {
        profile: 'fast',
        model: resolveModel('fast'),
        reason: 'default_fast',
        options: resolveOptions('fast')
    };
}

/* ── Model-based routing ─────────────────────────────────────────────── */

/**
 * Attempt to parse a raw string as a valid `ModelProfile`.
 *
 * @param raw - The candidate string (e.g. from an LLM response).
 * @returns The matching `ModelProfile`, or `null` if invalid.
 */
function parseProfile(raw: string): ModelProfile | null {
    const value = raw.trim().toLowerCase();
    if (value === 'fast' || value === 'reasoning' || value === 'code' || value === 'default') {
        return value;
    }
    return null;
}

/**
 * Select a model profile by asking a small, fast LLM to classify the task.
 *
 * The router model is prompted to return a JSON object with `profile`
 * and `reason` keys.  If the response is unparseable or the profile
 * is invalid, the caller should catch the error and fall back.
 *
 * @param input - The current routing input (task, context, step, budgets).
 * @returns A `ModelRouteDecision` based on the LLM's classification.
 * @throws {Error} When the LLM response cannot be parsed or contains an invalid profile.
 */
async function routeWithModel(input: IRouteInput): Promise<IModelRouteDecision> {
    const budgetInfo =
        `Context length: ${input.contextLength ?? input.context.length} chars ` +
        `(max ${BUDGET_MAX_CONTEXT_CHARS}). ` +
        `Elapsed: ${input.cumulativeDurationMs ?? 0} ms ` +
        `(max ${BUDGET_MAX_DURATION_MS} ms).`;

    const routerPrompt =
        `You are a model router.\n` +
        `Select exactly one profile: fast, reasoning, code, default.\n` +
        `Rules:\n` +
        `- Use code for coding/refactor/debug/repo/dev tasks.\n` +
        `- Use reasoning for hard logic, architecture, multi-step analysis.\n` +
        `- Use fast for simple Q&A.\n` +
        `- Use default only when uncertain.\n` +
        `Budget state: ${budgetInfo}\n` +
        `- If context is close to ceiling, prefer reasoning (larger context window).\n` +
        `- If elapsed time is close to max, prefer fast to finish quickly.\n` +
        `Respond ONLY with JSON: {"profile":"fast|reasoning|code|default","reason":"short reason"}\n\n` +
        `Task:\n${input.task}\n\n` +
        `Context:\n${input.context.slice(-2000)}`;

    const response = await generate(routerPrompt, {
        model: ROUTER_MODEL,
        stream: false,
        format: 'json'
    });

    /* Strip any markdown code fences the model may have added. */
    const cleaned = response.replace(/```(?:json)?\n?/g, '').trim();
    const parsed = JSON.parse(cleaned) as { profile?: string; reason?: string };
    const profile = parsed.profile ? parseProfile(parsed.profile) : null;
    if (!profile) {
        throw new Error(`Router returned invalid profile: ${String(parsed.profile)}`);
    }

    return {
        profile,
        model: resolveModel(profile),
        reason: parsed.reason?.slice(0, 240) ?? 'router_model_decision',
        options: resolveOptions(profile)
    };
}

/* ── Public API ──────────────────────────────────────────────────────── */

/**
 * Determine which Ollama model (and generation options) to use for the
 * current agent step.
 *
 * Resolution order:
 * 1. If `input.forcedProfile` is set → use it immediately (zero cost).
 * 2. If `AGENT_MODEL_ROUTER_MODE` is `"rules"` → keyword heuristic.
 * 3. If `AGENT_MODEL_ROUTER_MODE` is `"model"` → ask the router LLM.
 *    Falls back to the `default` profile if the LLM call fails.
 *
 * @param input - Task, context, step index, and optional forced profile.
 * @returns A `ModelRouteDecision` describing the chosen model.
 */
export async function routeModel(input: IRouteInput): Promise<IModelRouteDecision> {
    /* Forced profile — bypass all routing. */
    if (input.forcedProfile) {
        return {
            profile: input.forcedProfile,
            model: resolveModel(input.forcedProfile),
            reason: 'forced_by_caller',
            options: resolveOptions(input.forcedProfile)
        };
    }

    /* Rule-based routing (default). */
    if (ROUTER_MODE !== 'model') {
        return routeWithRules(input);
    }

    /* Model-based routing with fallback. */
    try {
        return await routeWithModel(input);
    } catch {
        return {
            profile: 'default',
            model: resolveModel('default'),
            reason: 'router_model_failed_fallback_default',
            options: resolveOptions('default')
        };
    }
}
