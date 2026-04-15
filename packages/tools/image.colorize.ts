/**
 * Image colorization tool — colorizes an input image via the external AI image
 * processor microservice.
 *
 * Calls `POST /colorize` on `IMAGE_PROCESSOR_URL` with a base64-encoded image.
 *
 * @module tools/image.colorize
 */

import { createImageProcessorTool } from './image.processor.shared';

/** Tool instance for colorizing an image via the external processor. */
export const imageColorizeTool = createImageProcessorTool({
    id: 'image_colorize',
    endpoint: '/colorize',
    description:
        'Colorize a grayscale or sketch image. Input: { image: string (base64), prompt?: string, negative_prompt?: string }. Output: { image: string (base64), duration_ms: number, model: string }.'
});
