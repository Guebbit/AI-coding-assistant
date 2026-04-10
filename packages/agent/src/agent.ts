import { generate } from "../../llm/src/ollama";
import { addMemory, getMemory } from "../../memory/src/memory";
import { emit } from "../../events/src/bus";
import type { Tool } from "../../tools/src/types";

interface AgentStep {
  thought: string;
  action: string;
  input: Record<string, unknown>;
}

/** Maximum number of reasoning steps before giving up. */
const MAX_STEPS = 5;

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
    let context = "";
    const memory = getMemory();

    emit({ type: "agent:start", payload: { task } });

    for (let step = 0; step < MAX_STEPS; step++) {
      const prompt = this.buildPrompt(task, context, memory);

      console.log({
        step,
        prompt: prompt.length > 300 ? prompt.slice(0, 300) + "…" : prompt,
      });

      // ── Call the LLM ────────────────────────────────────────────────────────
      let response: string;
      try {
        response = await generate(prompt);
      } catch (err) {
        emit({ type: "agent:error", payload: { step, error: String(err) } });
        throw err;
      }

      console.log({ step, response });

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
        continue;
      }

      emit({ type: "agent:step", payload: { step, parsed } });

      // ── Done — no tool action needed ────────────────────────────────────────
      if (parsed.action === "none") {
        addMemory(`Task: ${task} → ${parsed.thought}`);
        emit({ type: "agent:done", payload: { thought: parsed.thought } });
        return parsed.thought;
      }

      // ── Find and execute the requested tool ─────────────────────────────────
      const tool = this.tools.find((t) => t.name === parsed.action);
      if (!tool) {
        context +=
          `\nTool "${parsed.action}" does not exist. ` +
          `Available tools: ${this.tools.map((t) => t.name).join(", ")}.`;
        continue;
      }

      let result: unknown;
      try {
        result = await tool.execute(parsed.input);
      } catch (err) {
        context += `\nTool "${parsed.action}" failed: ${String(err)}`;
        emit({
          type: "tool:error",
          payload: { tool: parsed.action, error: String(err) },
        });
        continue;
      }

      emit({ type: "tool:result", payload: { tool: parsed.action, result } });
      context += `\nStep ${step} — "${parsed.action}" returned: ${JSON.stringify(result)}`;
    }

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
