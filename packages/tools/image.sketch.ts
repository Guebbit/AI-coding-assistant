/**
 * Image sketching tool — converts an input image into sketch/line-art via the
 * external AI image processor microservice.
 *
 * Calls `POST /sketch` on `IMAGE_PROCESSOR_URL` with a base64-encoded image.
 *
 * @module tools/image.sketch
 */

import { z } from 'zod';
import { createTool } from './tool-builder';
import { IMAGE_PROCESSOR_TIMEOUT_MS, IMAGE_PROCESSOR_URL } from './image.processor.config';

/**
 * Schema for sketch tool input.
 */
const imageSketchInputSchema = z.object({
    image: z.string().trim().min(1, '"image" must be a non-empty base64 string'),
    prompt: z.string().trim().min(1).optional(),
    negative_prompt: z.string().trim().min(1).optional()
});

/**
 * Schema for sketch tool output.
 */
const imageSketchOutputSchema = z.object({
    image: z.string().trim().min(1),
    duration_ms: z.number().nonnegative(),
    model: z.string().trim().min(1)
});

/** Strongly typed sketch tool input inferred from Zod schema. */
type ImageSketchInput = z.infer<typeof imageSketchInputSchema>;

/** Strongly typed sketch tool output inferred from Zod schema. */
type ImageSketchOutput = z.infer<typeof imageSketchOutputSchema>;

/**
 * Call the external `/sketch` endpoint and return a validated JSON payload.
 *
 * @param payload - Body forwarded to the image processor service.
 * @returns Parsed and validated tool output.
 */
async function requestSketch(payload: ImageSketchInput): Promise<ImageSketchOutput> {
    const abortController = new AbortController();
    const timeoutHandle = setTimeout(() => abortController.abort(), IMAGE_PROCESSOR_TIMEOUT_MS);

    try {
        const response = await fetch(`${IMAGE_PROCESSOR_URL}/sketch`, {
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
                `Image processor /sketch error: ${response.status} ${response.statusText}${body ? ` — ${body}` : ''}`
            );
        }

        const parsed = (await response.json()) as unknown;
        return imageSketchOutputSchema.parse(parsed);
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error(
                `Image processor /sketch request timed out after ${IMAGE_PROCESSOR_TIMEOUT_MS}ms`
            );
        }
        throw error;
    } finally {
        clearTimeout(timeoutHandle);
    }
}

/**
 * Tool instance for sketching/inking an image via the external processor.
 */
export const imageSketchTool = createTool<ImageSketchInput, ImageSketchOutput>({
    id: 'image_sketch',
    description:
        'Create a sketch/line-art version of an image using the external image processor service. ' +
        'Input: { image: string (base64 PNG/JPEG/WEBP), prompt?: string, negative_prompt?: string }. ' +
        'Output: { image: string (base64 PNG), duration_ms: number, model: string }.',
    inputSchema: imageSketchInputSchema,
    outputSchema: imageSketchOutputSchema,

    /**
     * Execute image sketching using the configured image processor.
     *
     * @param input - Image sketching request payload.
     * @returns Sketch result with metadata.
     */
    async execute(input): Promise<ImageSketchOutput> {
        return requestSketch(input);
    }
});
