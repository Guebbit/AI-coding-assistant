import { z } from "zod";

/**
 * Zod schema for a single agent reasoning step.
 *
 * Replaces the manual `JSON.parse(…) as AgentStep` cast in the agent loop with
 * a fully-validated, type-safe parse.  Any LLM response that does not match
 * this shape triggers a `ZodError` which the agent handles the same way as an
 * unparseable JSON response (it asks the model to self-correct).
 *
 * Adopting Mastra's pattern of using Zod schemas for structured LLM output:
 *   https://mastra.ai/docs/agents/structured-output
 */
export const agentStepSchema = z.object({
  /** The model's internal chain-of-thought reasoning. */
  thought: z.string().min(1).describe("Internal reasoning"),

  /**
   * Name of the tool to invoke, or the literal string `"none"` when the
   * task is complete and no further tool call is needed.
   */
  action: z.string().min(1).describe('Tool name or "none"'),

  /**
   * Key/value pairs forwarded verbatim to `tool.execute()`.
   * Empty object `{}` is valid (and expected) when `action` is `"none"`.
   */
  input: z.record(z.unknown()).describe("Tool input parameters"),
});

/**
 * TypeScript type inferred directly from `agentStepSchema`.
 *
 * Replaces the hand-written `interface AgentStep` that previously lived in
 * `agent.ts`, ensuring the type and the runtime validation always stay in sync.
 */
export type AgentStep = z.infer<typeof agentStepSchema>;
