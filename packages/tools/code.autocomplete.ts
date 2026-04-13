/**
 * Code autocomplete tool — generate IDE-style completions via an
 * Ollama code model.
 *
 * Uses the shared `envFloat` / `envInt` helpers for generation
 * option parsing.
 *
 * @module tools/code.autocomplete
 */

import { generate } from '../llm/ollama';
import type { ITool } from './types';
import { envFloat, envInt } from '../shared';

/** Default IDE completion model, configurable via environment variable. */
const DEFAULT_IDE_MODEL =
    process.env.TOOL_IDE_MODEL ?? process.env.AGENT_MODEL_CODE ?? 'starcoder2';

/**
 * Tool instance for generating code completions from prefix/suffix context.
 *
 * Input:
 * ```json
 * { "prefix": "function add(", "suffix": "}", "language": "typescript", "model": "starcoder2" }
 * ```
 */
export const codeAutocompleteTool: ITool = {
    name: 'code_autocomplete',
    description:
        'Generate code completion suggestions from prefix/suffix context. ' +
        'Input: { prefix: string, suffix?: string, language?: string, model?: string }',

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
        if (typeof prefix !== 'string' || prefix.trim() === '') {
            throw new Error('"prefix" must be a non-empty string');
        }

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
                temperature: envFloat(process.env.TOOL_IDE_TEMPERATURE, 0.1),
                top_p: envFloat(process.env.TOOL_IDE_TOP_P, 0.7),
                top_k: envInt(process.env.TOOL_IDE_TOP_K, 10),
                num_ctx: envInt(process.env.TOOL_IDE_NUM_CTX, 8192),
                repeat_penalty: envFloat(process.env.TOOL_IDE_REPEAT_PENALTY, 1.2)
            }
        });

        return {
            model: usedModel,
            language: usedLanguage,
            completion: completion.trim()
        };
    }
};
