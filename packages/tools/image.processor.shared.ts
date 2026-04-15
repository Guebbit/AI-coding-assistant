/**
 * Shared infrastructure for image-processor based tools.
 *
 * Provides common schemas, HTTP request handling, and a factory for creating
 * image tools (e.g. sketch, colorize) with minimal duplication.
 *
 * @module tools/image.processor.shared
 */

import { z } from 'zod';
import { envInt } from '../shared';
import { createTool } from './tool-builder';

/** Base URL for the external image processor service. */
export const IMAGE_PROCESSOR_URL = process.env.IMAGE_PROCESSOR_URL ?? 'http://localhost:5000';

/** HTTP timeout (ms) for image-processor requests. */
export const IMAGE_PROCESSOR_TIMEOUT_MS = envInt(process.env.IMAGE_PROCESSOR_TIMEOUT, 120_000);

/**
 * Shared base input schema for image-processor tools.
 */
export const imageProcessorInputSchema = z.object({
    image: z.string().trim().min(1, '"image" must be a non-empty base64 string'),
    prompt: z.string().trim().min(1).optional(),
    negative_prompt: z.string().trim().min(1).optional()
});

/**
 * Shared base output schema for image-processor tools.
 */
export const imageProcessorOutputSchema = z.object({
    image: z.string().trim().min(1),
    duration_ms: z.number().nonnegative(),
    model: z.string().trim().min(1)
});

/**
 * Strongly typed input inferred from `imageProcessorInputSchema`.
 */
export type ImageProcessorInput = z.infer<typeof imageProcessorInputSchema>;

/**
 * Strongly typed output inferred from `imageProcessorOutputSchema`.
 */
export type ImageProcessorOutput = z.infer<typeof imageProcessorOutputSchema>;

/**
 * Call a specific image processor endpoint and validate the JSON response.
 *
 * @template TOutput - Output type inferred from the provided schema.
 * @param endpoint - Endpoint path (for example `/sketch` or `/colorize`).
 * @param payload - Request payload forwarded to the image processor service.
 * @param outputSchema - Zod schema used to validate the processor response.
 * @returns Parsed and validated output payload.
 */
export async function requestImageProcessor<TOutput>(
    endpoint: string,
    payload: Record<string, unknown>,
    outputSchema: z.ZodType<TOutput>
): Promise<TOutput> {
    const abortController = new AbortController();
    const timeoutHandle = setTimeout(() => abortController.abort(), IMAGE_PROCESSOR_TIMEOUT_MS);

    try {
        const response = await fetch(`${IMAGE_PROCESSOR_URL}${endpoint}`, {
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
                `Image processor ${endpoint} error: ${response.status} ${response.statusText}${body ? ` — ${body}` : ''}`
            );
        }

        const parsed = (await response.json()) as unknown;
        return outputSchema.parse(parsed);
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error(
                `Image processor ${endpoint} request timed out after ${IMAGE_PROCESSOR_TIMEOUT_MS}ms`
            );
        }

        throw error;
    } finally {
        clearTimeout(timeoutHandle);
    }
}

/**
 * Options for creating an image-processor tool instance.
 *
 * @template TInput - Input shape accepted by the tool.
 * @template TOutput - Output shape returned by the tool.
 */
export interface ICreateImageProcessorToolOptions<TInput extends Record<string, unknown>, TOutput> {
    /** Unique tool identifier used by the agent loop. */
    id: string;
    /** Processor endpoint path, for example `/sketch` or `/colorize`. */
    endpoint: string;
    /** Human-readable description forwarded to the LLM prompt. */
    description: string;
    /** Optional custom input schema (defaults to the shared base schema). */
    inputSchema?: z.ZodType<TInput>;
    /** Optional custom output schema (defaults to the shared base schema). */
    outputSchema?: z.ZodType<TOutput>;
}

/**
 * Create a tool backed by the external image processor service.
 *
 * Defaults to shared input/output schemas, while allowing future tools to
 * override schemas (e.g. by extending base input with extra fields).
 *
 * @template TInput - Input shape accepted by the tool.
 * @template TOutput - Output shape returned by the tool.
 * @param options - Tool metadata, endpoint, and optional schema overrides.
 * @returns A fully-formed image-processor tool.
 */
export function createImageProcessorTool<
    TInput extends Record<string, unknown> = ImageProcessorInput,
    TOutput = ImageProcessorOutput
>(options: ICreateImageProcessorToolOptions<TInput, TOutput>) {
    const inputSchema =
        options.inputSchema ?? (imageProcessorInputSchema as unknown as z.ZodType<TInput>);
    const outputSchema =
        options.outputSchema ?? (imageProcessorOutputSchema as unknown as z.ZodType<TOutput>);

    return createTool<TInput, TOutput>({
        id: options.id,
        description: options.description,
        inputSchema,
        outputSchema,
        async execute(input): Promise<TOutput> {
            return requestImageProcessor(options.endpoint, input, outputSchema);
        }
    });
}
