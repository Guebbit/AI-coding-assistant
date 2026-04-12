import { generateWithMetadata } from "../../llm/src/ollama";
import { addMemory, getMemory } from "../../memory/src/memory";
import { emit } from "../../events/src/bus";
import type { Tool } from "../../tools/src";
import { getLogger } from "../../logger/src/logger";
import { routeModel } from "./model-router";

interface AgentStep {
  thought: string;
  action: string;
  input: Record<string, unknown>;
}

// Maximum number of reasoning steps before giving up.
const MAX_STEPS = Number.parseInt(process.env.AGENTS_MAX_STEPS ?? "5", 10);
const log = getLogger("agent");

/**
 * Core agent loop.
 *
 * Each iteration:
 *  1. Build a prompt from the task, accumulated context, and memory.
 *  2. Call the LLM and parse its JSON response.
 *  3. Execute the chosen tool (or return if action === "none").
 *  4. Append the tool result to context and repeat.
 *
 * Design principles:
 *  - No magic — every decision is traceable via console logs and events.
 *  - Resilient — bad JSON and unknown tools are recovered rather than crashing.
 *  - Observable — every significant state change emits a typed event.
 */
export class Agent {
  constructor(private readonly tools: Tool[]) {}

  async run(task: string): Promise<string> {
    const runStartedAt = Date.now();
    let context = "";
    log.info("agent_run_started", {
      task,
      taskLength: task.length,
      maxSteps: MAX_STEPS,
      toolCount: this.tools.length,
    });

    const memoryStartedAt = Date.now();
    const memory = await getMemory(task);
    log.info("agent_memory_loaded", {
      memoryCount: memory.length,
      durationMs: Date.now() - memoryStartedAt,
    });

    emit({ type: "agent:start", payload: { task } });

    for (let step = 0; step < MAX_STEPS; step++) {
      const stepStartedAt = Date.now();
      const prompt = this.buildPrompt(task, context, memory);
      log.info("agent_step_started", {
        step,
        contextLength: context.length,
        promptLength: prompt.length,
        promptPreview: prompt.length > 300 ? prompt.slice(0, 300) + "…" : prompt,
      });

      // ── Call the LLM ────────────────────────────────────────────────────────
      let response: string;
      try {
        const route = await routeModel({ task, context, step });
        emit({
          type: "agent:model_routed",
          payload: {
            step,
            profile: route.profile,
            model: route.model,
            reason: route.reason,
          },
        });

        const llmStartedAt = Date.now();
        const llmResult = await generateWithMetadata(prompt, { model: route.model });
        response = llmResult.response;
        log.info("agent_llm_response_received", {
          step,
          responseLength: response.length,
          durationMs: Date.now() - llmStartedAt,
          routedProfile: route.profile,
          routedReason: route.reason,
          model: llmResult.model,
          done: llmResult.done,
          doneReason: llmResult.doneReason,
          totalDurationNs: llmResult.totalDurationNs,
          loadDurationNs: llmResult.loadDurationNs,
          promptEvalCount: llmResult.promptEvalCount,
          promptEvalDurationNs: llmResult.promptEvalDurationNs,
          evalCount: llmResult.evalCount,
          evalDurationNs: llmResult.evalDurationNs,
        });
      } catch (err) {
        log.error("agent_llm_call_failed", { step, error: String(err) });
        emit({ type: "agent:error", payload: { step, error: String(err) } });
        throw err;
      }

      // ── Parse the LLM response ──────────────────────────────────────────────
      let parsed: AgentStep;
      try {
        // Strip markdown code fences that some models add around JSON
        const cleaned = response.replace(/```(?:json)?\n?/g, "").trim();
        parsed = JSON.parse(cleaned) as AgentStep;
      } catch {
        // Give the model a chance to self-correct on the next iteration
        context +=
          "\nYour previous response was not valid JSON. " +
          "Please respond ONLY with a single valid JSON object.";
        log.warn("agent_invalid_json_response", {
          step,
          responseLength: response.length,
          contextLength: context.length,
        });
        continue;
      }

      log.info("agent_step_parsed", {
        step,
        action: parsed.action,
        thoughtLength: parsed.thought.length,
      });
      emit({ type: "agent:step", payload: { step, parsed } });

      // ── Done — no tool action needed ────────────────────────────────────────
      if (parsed.action === "none") {
        await addMemory(`Task: ${task} → ${parsed.thought}`);
        log.info("agent_run_completed", {
          step,
          durationMs: Date.now() - runStartedAt,
          finalThoughtLength: parsed.thought.length,
        });
        emit({ type: "agent:done", payload: { thought: parsed.thought } });
        return parsed.thought;
      }

      // ── Find and execute the requested tool ─────────────────────────────────
      const tool = this.tools.find((t) => t.name === parsed.action);
      if (!tool) {
        log.warn("agent_unknown_tool", {
          step,
          action: parsed.action,
          availableTools: this.tools.map((t) => t.name),
        });
        context +=
          `\nTool "${parsed.action}" does not exist. ` +
          `Available tools: ${this.tools.map((t) => t.name).join(", ")}.`;
        continue;
      }

      let result: unknown;
      try {
        const toolStartedAt = Date.now();
        result = await tool.execute(parsed.input);
        let resultSize = -1;
        try {
          resultSize = JSON.stringify(result).length;
        } catch {
          log.warn("agent_tool_result_not_serializable", {
            step,
            tool: parsed.action,
          });
        }
        log.info("agent_tool_executed", {
          step,
          tool: parsed.action,
          durationMs: Date.now() - toolStartedAt,
          resultSize,
        });
      } catch (err) {
        context += `\nTool "${parsed.action}" failed: ${String(err)}`;
        log.warn("agent_tool_failed", {
          step,
          tool: parsed.action,
          error: String(err),
        });
        emit({
          type: "tool:error",
          payload: { tool: parsed.action, error: String(err) },
        });
        continue;
      }

      emit({ type: "tool:result", payload: { tool: parsed.action, result } });
      context += `\nStep ${step} — "${parsed.action}" returned: ${JSON.stringify(result)}`;
      log.info("agent_step_finished", {
        step,
        durationMs: Date.now() - stepStartedAt,
        contextLength: context.length,
      });
    }

    log.warn("agent_max_steps_reached", {
      durationMs: Date.now() - runStartedAt,
      task,
    });
    emit({ type: "agent:max_steps", payload: { task } });
    return "Max steps reached without a conclusive answer.";
  }

  private buildPrompt(
    task: string,
    context: string,
    memory: string[]
  ): string {
    const memoryBlock =
      memory.length > 0
        ? `Recent memory:\n${memory.join("\n")}\n\n`
        : "";

    const contextBlock = context ? `Context so far:\n${context}\n\n` : "";

    const toolList = this.tools
      .map((t) => `- ${t.name}: ${t.description}`)
      .join("\n");

    return (
      `You are an AI agent with access to tools.\n\n` +
      `Task:\n${task}\n\n` +
      memoryBlock +
      contextBlock +
      `Available tools:\n${toolList}\n\n` +
      `Respond ONLY with a single valid JSON object — no markdown, no extra text:\n` +
      `{\n` +
      `  "thought": "your reasoning",\n` +
      `  "action": "tool_name or none",\n` +
      `  "input": {}\n` +
      `}\n\n` +
      `Use action "none" when the task is fully complete.`
    );
  }
}
