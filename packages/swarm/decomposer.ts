/**
 * Task decomposer — breaks a complex user task into a set of
 * focused subtasks suitable for parallel or sequential execution
 * by specialised agent instances.
 *
 * Uses a single LLM call (via the `reasoning` profile model) to
 * analyse the task and return a structured JSON decomposition.
 *
 * Falls back to a single-subtask plan when the LLM cannot produce
 * valid JSON or when the task is too simple to decompose.
 *
 * @module swarm/decomposer
 */

import { generate } from "../llm/ollama";
import { getLogger } from "../logger/logger";
import type { IDecomposition, ISubtask } from "./types";

const log = getLogger("swarm:decomposer");

/* ── Environment ─────────────────────────────────────────────────────── */

/**
 * Model used for task decomposition.
 * Defaults to the reasoning model (best at structured analysis).
 */
const DECOMPOSER_MODEL =
  process.env.SWARM_DECOMPOSER_MODEL ??
  process.env.AGENT_MODEL_REASONING ??
  process.env.AGENT_MODEL_DEFAULT ??
  process.env.OLLAMA_MODEL ??
  "llama3";

/**
 * Maximum subtasks the decomposer is allowed to emit.
 * Hard upper bound — the caller can further restrict via `maxSubtasks`.
 */
const DECOMPOSER_HARD_MAX = 10;

/* ── Public API ──────────────────────────────────────────────────────── */

/**
 * Decompose a user task into subtasks using an LLM.
 *
 * The function sends a carefully crafted prompt asking the model to
 * return a JSON array of subtasks, each with an `id`, `description`,
 * `profile` suggestion, and `dependsOn` array.
 *
 * @param task        - The user's original task description.
 * @param maxSubtasks - Maximum number of subtasks to produce (clamped to {@link DECOMPOSER_HARD_MAX}).
 * @returns A structured {@link IDecomposition} with subtasks and reasoning.
 */
export async function decomposeTask(
  task: string,
  maxSubtasks = 6,
): Promise<IDecomposition> {
  const cap = Math.min(maxSubtasks, DECOMPOSER_HARD_MAX);

  const prompt =
    `You are a task planner for an AI agent swarm.\n` +
    `Break the following task into ${cap} or fewer focused subtasks.\n` +
    `Each subtask will be executed by a separate AI agent with its own tools.\n\n` +
    `Available agent profiles:\n` +
    `- "fast"      — quick, simple tasks (Q&A, summaries, short answers)\n` +
    `- "code"      — coding, debugging, refactoring, writing code\n` +
    `- "reasoning" — complex analysis, multi-step logic, architecture decisions\n` +
    `- "default"   — general-purpose fallback\n\n` +
    `Rules:\n` +
    `1. Each subtask must be self-contained — it should be understandable without reading the other subtasks.\n` +
    `2. Use the "dependsOn" field to express ordering constraints (subtask IDs that must finish first).\n` +
    `3. Subtasks with no dependencies can run in parallel.\n` +
    `4. If the task is simple enough for a single agent, return exactly one subtask.\n` +
    `5. Never create more than ${cap} subtasks.\n\n` +
    `Respond ONLY with a JSON object (no markdown, no extra text):\n` +
    `{\n` +
    `  "reasoning": "short explanation of your decomposition strategy",\n` +
    `  "subtasks": [\n` +
    `    {\n` +
    `      "id": "subtask-0",\n` +
    `      "description": "what this subtask does",\n` +
    `      "profile": "fast|code|reasoning|default",\n` +
    `      "dependsOn": []\n` +
    `    }\n` +
    `  ]\n` +
    `}\n\n` +
    `Task:\n${task}`;

  log.info("decomposer_started", { taskLength: task.length, maxSubtasks: cap });

  let raw: string;
  try {
    raw = await generate(prompt, {
      model: DECOMPOSER_MODEL,
      stream: false,
      format: "json",
    });
  } catch (error) {
    log.warn("decomposer_llm_failed", { error: String(error) });
    return buildFallback(task, "LLM call failed — falling back to single subtask.");
  }

  try {
    const cleaned = raw.replace(/```(?:json)?\n?/g, "").trim();
    const parsed = JSON.parse(cleaned) as {
      reasoning?: string;
      subtasks?: unknown[];
    };

    if (!Array.isArray(parsed.subtasks) || parsed.subtasks.length === 0) {
      return buildFallback(task, "Decomposer returned no subtasks.");
    }

    const subtasks = parsed.subtasks
      .slice(0, cap)
      .map((raw, i) => normaliseSubtask(raw, i));

    log.info("decomposer_completed", {
      subtaskCount: subtasks.length,
      reasoning: parsed.reasoning?.slice(0, 200),
    });

    return {
      reasoning: parsed.reasoning ?? "No reasoning provided by decomposer.",
      subtasks,
    };
  } catch (error) {
    log.warn("decomposer_parse_failed", { error: String(error) });
    return buildFallback(task, "Failed to parse decomposer output.");
  }
}

/* ── Internal helpers ────────────────────────────────────────────────── */

/**
 * Normalise a raw subtask object from the LLM into a well-typed {@link ISubtask}.
 *
 * @param raw   - The raw object parsed from JSON.
 * @param index - Position in the subtask array, used to generate a fallback ID.
 * @returns A validated {@link ISubtask}.
 */
function normaliseSubtask(raw: unknown, index: number): ISubtask {
  const obj = (typeof raw === "object" && raw !== null ? raw : {}) as Record<
    string,
    unknown
  >;

  const id =
    typeof obj.id === "string" && obj.id.trim() !== ""
      ? obj.id.trim()
      : `subtask-${index}`;

  const description =
    typeof obj.description === "string" && obj.description.trim() !== ""
      ? obj.description.trim()
      : `Subtask ${index}`;

  const validProfiles = new Set(["fast", "code", "reasoning", "default"]);
  const profile =
    typeof obj.profile === "string" && validProfiles.has(obj.profile)
      ? (obj.profile as ISubtask["profile"])
      : "default";

  const dependsOn = Array.isArray(obj.dependsOn)
    ? obj.dependsOn.filter((d): d is string => typeof d === "string")
    : [];

  return { id, description, profile, dependsOn };
}

/**
 * Build a single-subtask fallback decomposition when the LLM fails
 * or returns unusable output.
 *
 * @param task   - The original task (becomes the subtask description).
 * @param reason - Why the fallback was triggered (for diagnostics).
 * @returns A minimal {@link IDecomposition} with one subtask.
 */
function buildFallback(task: string, reason: string): IDecomposition {
  log.info("decomposer_fallback", { reason });
  return {
    reasoning: reason,
    subtasks: [
      {
        id: "subtask-0",
        description: task,
        profile: "default",
        dependsOn: [],
      },
    ],
  };
}
