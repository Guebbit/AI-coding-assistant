import { z } from "zod";
import type { Tool } from "./types";

/**
 * Options accepted by `createTool`.
 *
 * Modelled after Mastra's `createTool` pattern so that the project stays
 * future-compatible if you decide to integrate the full Mastra framework later.
 *
 * @template TInput  - Inferred from `inputSchema` (defaults to `Record<string, unknown>`)
 * @template TOutput - Inferred from `outputSchema` (defaults to `unknown`)
 */
export interface CreateToolOptions<
  TInput extends Record<string, unknown>,
  TOutput,
> {
  /**
   * Unique identifier — used as `tool.name` and matched by the agent loop.
   * Prefer snake_case to stay consistent with existing tools (e.g. `read_file`).
   */
  id: string;

  /** Human-readable description forwarded to the LLM prompt. */
  description: string;

  /**
   * Zod schema that describes the expected input shape.
   * When supplied, the input is validated *before* `execute` is called.
   * Validation errors surface as thrown `ZodError` instances.
   */
  inputSchema?: z.ZodType<TInput>;

  /**
   * Zod schema that describes the output shape.
   * Purely informational — validation of the output is left to the caller
   * (e.g. an eval scorer can use it to confirm shape compliance).
   */
  outputSchema?: z.ZodType<TOutput>;

  /**
   * The tool's implementation.
   * Receives a *typed* input (inferred from `inputSchema`) so you get
   * full IDE auto-complete and type safety inside the function body.
   */
  execute: (input: TInput) => Promise<TOutput>;
}

/**
 * Build a `Tool` with optional Zod schema validation.
 *
 * Adopting Mastra's `createTool` naming for future compatibility.
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
 * ## Backward compatibility
 * Tools created with `createTool` satisfy the existing `Tool` interface, so
 * they can be passed to `new Agent([...])` without any changes to the agent.
 */
export function createTool<
  TInput extends Record<string, unknown> = Record<string, unknown>,
  TOutput = unknown,
>(options: CreateToolOptions<TInput, TOutput>): Tool {
  return {
    name: options.id,
    description: options.description,
    inputSchema: options.inputSchema,
    outputSchema: options.outputSchema,

    async execute(rawInput: Record<string, unknown>): Promise<unknown> {
      if (options.inputSchema) {
        // Validate — throws ZodError with a descriptive message on failure
        const parsed = options.inputSchema.parse(rawInput);
        return options.execute(parsed);
      }

      return options.execute(rawInput as TInput);
    },
  };
}
