/**
 * Unit tests for apps/api/middlewares/multer.ts
 */

import type { Express } from 'express';
import { describe, it, expect, vi } from 'vitest';
import { ALLOWED_MIME_TYPES, upload } from '../../../apps/api/middlewares/multer.js';

describe('ALLOWED_MIME_TYPES', () => {
    it('contains the expected MIME types', () => {
        expect(ALLOWED_MIME_TYPES).toEqual([
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/webp',
            'audio/mpeg',
            'audio/wav',
            'audio/ogg',
            'audio/webm',
            'audio/mp4',
            'application/pdf',
        ]);
    });
});

describe('upload.fileFilter', () => {
    it('accepts supported MIME types', () => {
        const callback = vi.fn();
        upload.fileFilter(
            {} as never,
            { mimetype: 'image/png' } as Express.Multer.File,
            callback,
        );

        expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('rejects unsupported MIME types with a descriptive error', () => {
        const callback = vi.fn();
        upload.fileFilter(
            {} as never,
            { mimetype: 'application/zip' } as Express.Multer.File,
            callback,
        );

        expect(callback).toHaveBeenCalledTimes(1);
        const [error, accepted] = callback.mock.calls[0] as [Error, boolean];
        expect(accepted).toBe(false);
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toBe('Unsupported file type: application/zip');
    });
});
