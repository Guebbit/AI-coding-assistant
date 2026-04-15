/**
 * Central Multer middleware configuration for upload endpoints.
 *
 * @module apps/api/middlewares/multer
 */

import multer from "multer";

/**
 * Allowed MIME types for upload endpoints.
 *
 * This allowlist is shared by all multipart upload routes to ensure
 * only supported image, audio, and document formats are accepted.
 */
export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/webm",
  "audio/mp4",
  "application/pdf",
] as const;

/**
 * Shared Multer instance for all upload routes.
 *
 * - Uses in-memory storage (no disk writes).
 * - Enforces a 50 MB file size limit.
 * - Rejects unsupported MIME types and propagates the error to
 *   the global Express error handler.
 */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype as (typeof ALLOWED_MIME_TYPES)[number])) {
      const callback = cb as (error: Error, acceptFile: boolean) => void;
      callback(new Error(`Unsupported file type: ${file.mimetype}`), false);
      return;
    }

    cb(null, true);
  },
});
