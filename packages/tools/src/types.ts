/**
 * Core tool interface.
 *
 * Everything the agent can do is expressed as a Tool.
 * Input is always a JSON object; output must be JSON-serializable.
 */
export interface Tool {
  /** Unique identifier used by the agent to select this tool. */
  name: string;

  /** Plain-English description sent to the LLM so it knows when to use the tool. */
  description: string;

  /**
   * Execute the tool with the given input.
   *
   * @param input - Parsed JSON from the LLM's "input" field
   * @returns A JSON-serializable result
   */
  execute(input: Record<string, unknown>): Promise<unknown>;
}
