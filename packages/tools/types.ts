import type { ZodType } from "zod";

/**
 * Core tool interface.
 *
 * Everything the agent can do is expressed as a Tool.
 * Input is always a JSON object; output must be JSON-serializable.
 *
 * Follows Mastra's tool pattern — tools can optionally declare Zod schemas
 * for both input and output, enabling automatic validation and rich IDE support.
 */
export interface Tool {
  /** Unique identifier used by the agent to select this tool. */
  name: string;

  /** Plain-English description sent to the LLM so it knows when to use the tool. */
  description: string;

  /**
   * Optional Zod schema describing the expected input shape.
   * When provided, `createTool` will validate the LLM-supplied input before
   * calling `execute`, throwing a descriptive error on mismatch.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputSchema?: ZodType<any>;

  /**
   * Optional Zod schema describing the output shape.
   * Useful for downstream consumers (evals, UI) that need a typed contract.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  outputSchema?: ZodType<any>;

  /**
   * Execute the tool with the given input.
   *
   * @param input - Parsed JSON from the LLM's "input" field
   * @returns A JSON-serializable result
   */
  execute(input: Record<string, unknown>): Promise<unknown>;
}
