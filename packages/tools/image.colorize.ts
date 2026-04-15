/**
 * Image colorization tool — colorizes an input image via the external AI image
 * processor microservice.
 *
 * Calls `POST /colorize` on `IMAGE_PROCESSOR_URL` with a base64-encoded image.
 *
 * @module tools/image.colorize
 */

import { z } from 'zod';
import { createTool } from './tool-builder';
import { IMAGE_PROCESSOR_TIMEOUT_MS, IMAGE_PROCESSOR_URL } from './image.processor.config';

/**
 * Schema for colorize tool input.
 */
const imageColorizeInputSchema = z.object({
    image: z.string().trim().min(1, '"image" must be a non-empty base64 string'),
    prompt: z.string().trim().min(1).optional(),
    negative_prompt: z.string().trim().min(1).optional()
});

/**
 * Schema for colorize tool output.
 */
const imageColorizeOutputSchema = z.object({
    image: z.string().trim().min(1),
    duration_ms: z.number().nonnegative(),
    model: z.string().trim().min(1)
});

/** Strongly typed colorize tool input inferred from Zod schema. */
type ImageColorizeInput = z.infer<typeof imageColorizeInputSchema>;

/** Strongly typed colorize tool output inferred from Zod schema. */
type ImageColorizeOutput = z.infer<typeof imageColorizeOutputSchema>;

/**
 * Call the external `/colorize` endpoint and return a validated JSON payload.
 *
 * @param payload - Body forwarded to the image processor service.
 * @returns Parsed and validated tool output.
 */
async function requestColorize(payload: ImageColorizeInput): Promise<ImageColorizeOutput> {
    const abortController = new AbortController();
    const timeoutHandle = setTimeout(() => abortController.abort(), IMAGE_PROCESSOR_TIMEOUT_MS);

    try {
        const response = await fetch(`${IMAGE_PROCESSOR_URL}/colorize`, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload),
            signal: abortController.signal
        });

        if (!response.ok) {
            const body = await response.text().catch(() => '');
            throw new Error(
                `Image processor /colorize error: ${response.status} ${response.statusText}${body ? ` — ${body}` : ''}`
            );
        }

        const parsed = (await response.json()) as unknown;
        return imageColorizeOutputSchema.parse(parsed);
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error(
                `Image processor /colorize request timed out after ${IMAGE_PROCESSOR_TIMEOUT_MS}ms`
            );
        }
        throw error;
    } finally {
        clearTimeout(timeoutHandle);
    }
}

/**
 * Tool instance for colorizing an image via the external processor.
 */
export const imageColorizeTool = createTool<ImageColorizeInput, ImageColorizeOutput>({
    id: 'image_colorize',
    description:
        'Colorize an image using the external image processor service. ' +
        'Input: { image: string (base64 PNG/JPEG/WEBP), prompt?: string, negative_prompt?: string }. ' +
        'Output: { image: string (base64 PNG), duration_ms: number, model: string }.',
    inputSchema: imageColorizeInputSchema,
    outputSchema: imageColorizeOutputSchema,

    /**
     * Execute image colorization using the configured image processor.
     *
     * @param input - Image colorization request payload.
     * @returns Colorized image result with metadata.
     */
    async execute(input): Promise<ImageColorizeOutput> {
        return requestColorize(input);
    }
});
