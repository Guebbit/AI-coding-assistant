/**
 * Code autocomplete tool — generate IDE-style completions via an
 * Ollama code model.
 *
 * Uses the shared `envNumber` helper for generation option parsing.
 *
 * @module tools/code.autocomplete
 */

import { generate } from '../llm/ollama';
import { z } from 'zod';
import { envNumber, resolveModel } from '../shared';
import { createTool } from './tool-builder';

/** Default IDE completion model, configurable via environment variable. */
const DEFAULT_IDE_MODEL = resolveModel('code', {
    preferredModel: process.env.TOOL_IDE_MODEL
});

/**
 * Tool instance for generating code completions from prefix/suffix context.
 *
 * Input:
 * ```json
 * { "prefix": "function add(", "suffix": "}", "language": "typescript", "model": "starcoder2" }
 * ```
 */
export const codeAutocompleteTool = createTool({
    id: 'code_autocomplete',
    description:
        'Generate code completion suggestions from prefix/suffix context. ' +
        'Input: { prefix: string, suffix?: string, language?: string, model?: string }',
    inputSchema: z.object({
        prefix: z.string().trim().min(1, '"prefix" must be a non-empty string'),
        suffix: z.string().optional(),
        language: z.string().optional(),
        model: z.string().optional()
    }),
    outputSchema: z.object({
        model: z.string(),
        language: z.string(),
        completion: z.string()
    }),

    /**
     * Generate a code continuation given the text before and after the cursor.
     *
     * @param input          - Tool input object.
     * @param input.prefix   - Code text before the cursor (required).
     * @param input.suffix   - Code text after the cursor (optional, for fill-in-the-middle).
     * @param input.language - Programming language hint (default: `"plaintext"`).
     * @param input.model    - Optional override for the completion model.
     * @returns `{ model, language, completion }` with the generated continuation.
     * @throws {Error} When `prefix` is missing or empty.
     */
    async execute({ prefix, suffix, language, model }) {
        const usedModel = typeof model === 'string' && model.trim() ? model : DEFAULT_IDE_MODEL;
        const usedLanguage =
            typeof language === 'string' && language.trim() ? language.trim() : 'plaintext';

        const prompt =
            `You are an IDE autocomplete engine.\n` +
            `Return only the code continuation.\n` +
            `Language: ${usedLanguage}\n` +
            `Code before cursor:\n${prefix}`;

        const completion = await generate(prompt, {
            model: usedModel,
            stream: false,
            suffix: typeof suffix === 'string' && suffix.trim() ? suffix : undefined,
            options: {
                temperature: envNumber(process.env.TOOL_IDE_TEMPERATURE, 0.1),
                top_p: envNumber(process.env.TOOL_IDE_TOP_P, 0.7),
                top_k: envNumber(process.env.TOOL_IDE_TOP_K, 10),
                num_ctx: envNumber(process.env.TOOL_IDE_NUM_CTX, 8192),
                repeat_penalty: envNumber(process.env.TOOL_IDE_REPEAT_PENALTY, 1.2)
            }
        });

        return {
            model: usedModel,
            language: usedLanguage,
            completion: completion.trim()
        };
    }
});
