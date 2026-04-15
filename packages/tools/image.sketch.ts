/**
 * Image sketching tool — converts an input image into sketch/line-art via the
 * external AI image processor microservice.
 *
 * Calls `POST /sketch` on `IMAGE_PROCESSOR_URL` with a base64-encoded image.
 *
 * @module tools/image.sketch
 */

import { createImageProcessorTool } from './image.processor.shared';

/** Tool instance for sketching/inking an image via the external processor. */
export const imageSketchTool = createImageProcessorTool({
    id: 'image_sketch',
    endpoint: '/sketch',
    description:
        'Generate a sketch/line-art version of an image. Input: { image: string (base64), prompt?: string, negative_prompt?: string }. Output: { image: string (base64), duration_ms: number, model: string }.'
});
