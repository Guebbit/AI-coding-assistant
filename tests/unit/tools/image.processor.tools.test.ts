/**
 * Unit tests for image processor tools (`image_sketch`, `image_colorize`).
 *
 * Validates schema checks, endpoint routing, and response passthrough.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { imageSketchTool } from '../../../packages/tools/image.sketch.js';
import { imageColorizeTool } from '../../../packages/tools/image.colorize.js';
import { IMAGE_PROCESSOR_URL } from '../../../packages/tools/image.processor.config.js';

describe('image processor tools', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('imageSketchTool validates required image input', async () => {
        await expect(
            imageSketchTool.execute({
                prompt: 'line art'
            } as unknown as Record<string, unknown>)
        ).rejects.toThrow();
    });

    it('imageSketchTool calls /sketch and returns processor payload', async () => {
        const mockedFetch = vi.mocked(fetch);
        mockedFetch.mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    image: 'c2tldGNo',
                    duration_ms: 321,
                    model: 'mock-sketch-model'
                }),
                { status: 200, headers: { 'Content-Type': 'application/json' } }
            )
        );

        const result = (await imageSketchTool.execute({
            image: 'aW5wdXQ=',
            prompt: 'ink line-art',
            negative_prompt: 'blurry'
        })) as Record<string, unknown>;

        expect(mockedFetch).toHaveBeenCalledTimes(1);
        expect(mockedFetch.mock.calls[0]?.[0]).toBe(`${IMAGE_PROCESSOR_URL}/sketch`);
        expect(result).toEqual({ image: 'c2tldGNo', duration_ms: 321, model: 'mock-sketch-model' });
    });

    it('imageColorizeTool calls /colorize and returns processor payload', async () => {
        const mockedFetch = vi.mocked(fetch);
        mockedFetch.mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    image: 'Y29sb3I=',
                    duration_ms: 654,
                    model: 'mock-colorize-model'
                }),
                { status: 200, headers: { 'Content-Type': 'application/json' } }
            )
        );

        const result = (await imageColorizeTool.execute({
            image: 'aW5wdXQ=',
            prompt: 'vibrant colors',
            negative_prompt: 'monochrome'
        })) as Record<string, unknown>;

        expect(mockedFetch).toHaveBeenCalledTimes(1);
        expect(mockedFetch.mock.calls[0]?.[0]).toBe(`${IMAGE_PROCESSOR_URL}/colorize`);
        expect(result).toEqual({
            image: 'Y29sb3I=',
            duration_ms: 654,
            model: 'mock-colorize-model'
        });
    });
});
