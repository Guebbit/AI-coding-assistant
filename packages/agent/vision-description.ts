/**
 * Vision description helper for the agent loop.
 *
 * Wraps `generate()` from `packages/llm/ollama` to produce a natural-language
 * description of a base64-encoded image using `TOOL_VISION_MODEL`.
 *
 * Fails open — returns `""` on any error so the agent loop is never blocked.
 *
 * @module agent/vision-description
 */

import { generate } from '../llm/ollama';
import { logger } from '../logger/logger';

const DEFAULT_VISION_PROMPT = 'Describe this image and identify what it most likely contains.';

/**
 * Generate a text description for a base64-encoded image.
 *
 * @param base64Image - Raw base64 image string (no data-URI prefix required).
 * @param prompt - Optional override for the vision prompt.
 * @returns Natural-language description, or `""` on failure.
 */
export function getVisionDescription(
    base64Image: string,
    prompt: string = DEFAULT_VISION_PROMPT
): Promise<string> {
    const model = process.env.TOOL_VISION_MODEL;
    if (!model) return Promise.resolve('');

    return generate(prompt, { model, images: [base64Image] })
        .then((response) => response.trim())
        .catch((error) => {
            logger.warn('vision_description_failed', {
                component: 'agent.vision_description',
                error: String(error)
            });
            return '';
        });
}
