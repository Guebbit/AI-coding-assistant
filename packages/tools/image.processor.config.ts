/**
 * Shared configuration for image-processor based tools.
 *
 * @module tools/image.processor.config
 */

import { envInt } from '../shared';

/** Base URL for the external image processor service. */
export const IMAGE_PROCESSOR_URL = process.env.IMAGE_PROCESSOR_URL ?? 'http://localhost:5000';

/** HTTP timeout (ms) for image-processor requests. */
export const IMAGE_PROCESSOR_TIMEOUT_MS = envInt(process.env.IMAGE_PROCESSOR_TIMEOUT, 120_000);
