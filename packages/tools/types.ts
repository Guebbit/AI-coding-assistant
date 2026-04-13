/**
 * Core Tool interface — the contract every agent tool must satisfy.
 *
 * Everything the agent can do is expressed as a `Tool`.  Input is
 * always a JSON object; output must be JSON-serializable.
 *
 * Follows Mastra's tool pattern — tools can optionally declare Zod
 * schemas for both input and output, enabling automatic validation
 * and rich IDE support.
 *
 * @module tools/types
 */

import type { ZodType } from 'zod';

/**
 * A Tool represents a single capability the agent can invoke.
 *
 * The agent discovers tools from the array passed to its constructor.
 * During each reasoning step the LLM selects a tool by `name` and
 * the agent calls `execute(input)` with the LLM-provided arguments.
 */
export interface ITool {
    /** Unique identifier used by the agent to select this tool (e.g. `"read_file"`). */
    name: string;

    /** Plain-English description sent to the LLM so it knows when to use the tool. */
    description: string;

    /**
     * Optional Zod schema describing the expected input shape.
     *
     * When provided, `createTool` will validate the LLM-supplied input
     * before calling `execute`, throwing a descriptive `ZodError` on
     * mismatch.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    inputSchema?: ZodType<any>;

    /**
     * Optional Zod schema describing the output shape.
     *
     * Useful for downstream consumers (evals, UI) that need a typed
     * contract.  Not validated at runtime by the agent itself.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    outputSchema?: ZodType<any>;

    /**
     * Execute the tool with the given input.
     *
     * @param input - Parsed JSON object from the LLM's `"input"` field.
     * @returns A JSON-serializable result.
     */
    execute(input: Record<string, unknown>): Promise<unknown>;
}
