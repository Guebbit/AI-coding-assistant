/**
 * Tool builder — factory for creating `Tool` objects with optional
 * Zod schema validation.
 *
 * Adopts Mastra's `createTool` naming for future compatibility.
 * Tools created with this builder satisfy the `Tool` interface and
 * can be passed directly to `new Agent([...])`.
 *
 * @module tools/tool-builder
 */

import { z } from 'zod';
import type { ITool } from './types';

/**
 * Options accepted by `createTool`.
 *
 * Modelled after Mastra's `createTool` pattern so the project stays
 * forward-compatible if you later integrate the full Mastra framework.
 *
 * @template TInput  - Inferred from `inputSchema` (defaults to `Record<string, unknown>`).
 * @template TOutput - Inferred from `outputSchema` (defaults to `unknown`).
 */
export interface ICreateToolOptions<TInput extends Record<string, unknown>, TOutput> {
    /**
     * Unique identifier — used as `tool.name` and matched by the agent loop.
     * Prefer snake_case to stay consistent with existing tools (e.g. `"read_file"`).
     */
    id: string;

    /** Human-readable description forwarded to the LLM prompt. */
    description: string;

    /**
     * Zod schema that describes the expected input shape.
     *
     * When supplied, the input is validated **before** `execute` is called.
     * Validation errors surface as thrown `ZodError` instances.
     */
    inputSchema?: z.ZodType<TInput>;

    /**
     * Zod schema that describes the output shape.
     *
     * Purely informational — validation of the output is left to the
     * caller (e.g. an eval scorer can use it to confirm shape compliance).
     */
    outputSchema?: z.ZodType<TOutput>;

    /**
     * The tool's implementation.
     *
     * Receives a *typed* input (inferred from `inputSchema`) so you get
     * full IDE auto-complete and type safety inside the function body.
     *
     * @param input - Validated input object (or raw input if no schema).
     * @returns A result that will be JSON-serialised by the agent.
     */
    execute: (input: TInput) => Promise<TOutput>;
}

/**
 * Build a `Tool` with optional Zod schema validation.
 *
 * ## Usage
 * ```typescript
 * import { z } from "zod";
 * import { createTool } from "../tools/tool-builder";
 *
 * export const greetTool = createTool({
 *   id: "greet",
 *   description: "Return a greeting. Input: { name: string }",
 *   inputSchema: z.object({ name: z.string().min(1) }),
 *   execute: async ({ name }) => `Hello, ${name}!`,
 * });
 * ```
 *
 * @template TInput  - Inferred input type from the Zod schema.
 * @template TOutput - Inferred output type from the Zod schema.
 * @param options - Tool configuration (id, description, schemas, execute fn).
 * @returns A fully-formed `Tool` instance ready for the agent.
 */
export function createTool<
    TInput extends Record<string, unknown> = Record<string, unknown>,
    TOutput = unknown
>(options: ICreateToolOptions<TInput, TOutput>): ITool {
    return {
        name: options.id,
        description: options.description,
        inputSchema: options.inputSchema,
        outputSchema: options.outputSchema,

        /**
         * Wrapper that validates the raw LLM input against the schema
         * (when provided) before delegating to the user's `execute` fn.
         *
         * @param rawInput - Untyped input object from the LLM response.
         * @returns The tool's result (type-erased to `unknown` for the `Tool` interface).
         */
        async execute(rawInput: Record<string, unknown>): Promise<unknown> {
            if (options.inputSchema) {
                /* Validate — throws ZodError with a descriptive message on failure. */
                const parsed = options.inputSchema.parse(rawInput);
                return options.execute(parsed);
            }

            return options.execute(rawInput as TInput);
        }
    };
}
