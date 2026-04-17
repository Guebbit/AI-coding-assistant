/**
 * Model router — selects the best Ollama model for each agent step.
 *
 * Routing strategy: a small, fast LLM (`AGENT_MODEL_ROUTER_MODEL`) classifies
 * the task and returns the appropriate profile.  Falls back to the `fast`
 * profile if the classifier call fails.
 *
 * A caller may also *force* a profile via `RouteInput.forcedProfile`,
 * which bypasses all routing logic entirely.
 *
 * Budget overrides are applied deterministically before the LLM call:
 * - Context near ceiling → `reasoning` (wider context window).
 * - Elapsed time near ceiling → `fast` (finish quickly).
 *
 * @module agent/model-router
 */

import { generate } from '../llm/ollama';
import { envFloat, envInt, resolveModel, stripCodeFences, PROFILE_LIST } from '../shared';
import type { ModelProfile } from '../shared';

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
export type { ModelProfile } from '../shared';

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

/** Default generation options per profile. Extend this map to add a new profile. */
/* eslint-disable @typescript-eslint/naming-convention -- Ollama API uses snake_case parameter names */
const PROFILE_OPTION_DEFAULTS: Record<
    ModelProfile,
    {
        temperature: number;
        top_p: number;
        top_k: number;
        num_ctx: number;
        repeat_penalty: number;
    }
> = {
    fast: { temperature: 0.3, top_p: 0.85, top_k: 30, num_ctx: 4096, repeat_penalty: 1.2 },
    reasoning: { temperature: 0.2, top_p: 0.8, top_k: 20, num_ctx: 8192, repeat_penalty: 1.3 },
    code: { temperature: 0.1, top_p: 0.9, top_k: 40, num_ctx: 6144, repeat_penalty: 1.1 }
};
/* eslint-enable @typescript-eslint/naming-convention */

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
    const d = PROFILE_OPTION_DEFAULTS[profile];
    return {
        temperature: envFloat(process.env[`${prefix}_TEMPERATURE`], d.temperature),
        top_p: envFloat(process.env[`${prefix}_TOP_P`], d.top_p),
        top_k: envInt(process.env[`${prefix}_TOP_K`], d.top_k),
        num_ctx: envInt(process.env[`${prefix}_NUM_CTX`], d.num_ctx),
        repeat_penalty: envFloat(process.env[`${prefix}_REPEAT_PENALTY`], d.repeat_penalty)
    };
}

/**
 * Build a `IModelRouteDecision` from a resolved profile and reason string.
 *
 * Centralises the repeated `{ profile, model: resolveModel(…), reason, options }` pattern.
 *
 * @param profile - The selected profile.
 * @param reason  - Short human-readable reason for the decision.
 * @returns A fully populated route decision.
 */
function buildDecision(profile: ModelProfile, reason: string): IModelRouteDecision {
    return {
        profile,
        model: resolveModel(profile),
        reason,
        options: resolveOptions(profile)
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
    const value = raw.trim().toLowerCase() as ModelProfile;
    return (PROFILE_LIST as string[]).includes(value) ? value : null;
}

/**
 * Select a model profile by asking a small, fast LLM to classify the task.
 *
 * The router model is prompted to return a JSON object with `profile`
 * and `reason` keys.  If the response is unparseable or the profile
 * is invalid, the caller should catch the error and fall back.
 *
 * @param input - The current routing input (task, context, step, budgets).
 * @returns A `IModelRouteDecision` based on the LLM's classification.
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
        `Select exactly one profile: fast, reasoning, code.\n` +
        `Rules:\n` +
        `- Use code for coding/refactor/debug/repo/dev tasks.\n` +
        `- Use reasoning for hard logic, architecture, multi-step analysis.\n` +
        `- Use fast for simple Q&A, greetings, or knowledge-based answers.\n` +
        `Budget state: ${budgetInfo}\n` +
        `- If context is close to ceiling, prefer reasoning (larger context window).\n` +
        `- If elapsed time is close to max, prefer fast to finish quickly.\n` +
        `Respond ONLY with JSON: {"profile":"fast|reasoning|code","reason":"short reason"}\n\n` +
        `Task:\n${input.task}\n\n` +
        `Context:\n${input.context.slice(-2000)}`;

    const response = await generate(routerPrompt, {
        model: process.env.AGENT_MODEL_ROUTER_MODEL,
        stream: false,
        format: 'json'
    });

    const cleaned = stripCodeFences(response);
    const parsed = JSON.parse(cleaned) as {
        profile?: string;
        reason?: string;
    };
    const profile = parsed.profile ? parseProfile(parsed.profile) : null;
    if (!profile) {
        throw new Error(`Router returned invalid profile: ${String(parsed.profile)}`);
    }

    return buildDecision(profile, parsed.reason?.slice(0, 240) ?? 'router_model_decision');
}

/* ── Public API ──────────────────────────────────────────────────────── */

/**
 * Determine which Ollama model (and generation options) to use for the
 * current agent step.
 *
 * Resolution order:
 * 1. If `input.forcedProfile` is set → use it immediately (zero cost).
 * 2. Budget overrides (deterministic, no LLM cost):
 *    - Context near ceiling → `reasoning`.
 *    - Elapsed time near ceiling → `fast`.
 * 3. Ask the router LLM (`AGENT_MODEL_ROUTER_MODEL`) to classify the task.
 *    Falls back to `fast` if the LLM call fails or returns an invalid profile.
 *
 * @param input - Task, context, step index, and optional forced profile.
 * @returns A `IModelRouteDecision` describing the chosen model.
 */
export async function routeModel(input: IRouteInput): Promise<IModelRouteDecision> {
    /* Forced profile — bypass all routing. */
    if (input.forcedProfile) {
        return buildDecision(input.forcedProfile, 'forced_by_caller');
    }

    /* Budget overrides — deterministic, no LLM cost. */
    const contextLength = input.contextLength ?? input.context.length;
    const durationMs = input.cumulativeDurationMs ?? 0;
    if (contextLength > BUDGET_MAX_CONTEXT_CHARS * BUDGET_CONTEXT_THRESHOLD) {
        return buildDecision('reasoning', 'budget:context_near_ceiling');
    }
    if (durationMs > BUDGET_MAX_DURATION_MS * BUDGET_DURATION_THRESHOLD) {
        return buildDecision('fast', 'budget:duration_near_ceiling');
    }

    /* LLM-based routing — delegate to small classifier model. */
    return routeWithModel(input).catch(() =>
        buildDecision('fast', 'router_model_failed_fallback_fast')
    );
}
