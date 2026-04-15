/**
 * Upload-based HTTP endpoints — process files sent via multipart form.
 *
 * These endpoints complement the agent-loop tools by accepting file
 * uploads directly from the API instead of requiring files to exist
 * on disk.  Each endpoint calls the corresponding tool with inline
 * base64 data, so the underlying logic is shared.
 *
 * Endpoints:
 * - `POST /upload/image-classify`  — classify/describe an uploaded image.
 * - `POST /upload/speech-to-text`  — transcribe an uploaded audio file.
 * - `POST /upload/read-pdf`        — extract text from an uploaded PDF.
 *
 * All endpoints use `multer` with in-memory storage and a 50 MB limit.
 *
 * @module apps/api/upload-endpoints
 */

import type express from "express";
import { imageClassifyTool, speechToTextTool, readPdfTool } from "../../packages/tools/index";
import { logger } from "../../packages/logger/logger";
import { rejectResponse, successResponse, t } from "../../packages/shared";
import { upload } from "./middlewares/multer";

/**
 * Register upload-based routes on the Express app.
 *
 * @param app - The Express application instance.
 * @returns Nothing.
 */
export function registerUploadRoutes(app: express.Express): void {
  /**
   * POST /upload/image-classify — classify/describe an uploaded image.
   *
   * Expects `multipart/form-data` with:
   * - `file` (required) — the image file.
   * - `prompt` (optional) — custom vision prompt.
   * - `model` (optional) — override the vision model name.
   *
   * Response: `{ model, response }` where `response` is the model's description.
   */
  app.post("/upload/image-classify", upload.single("file"), (req, res) => {
    if (!req.file) {
      rejectResponse(res, 400, "Bad Request", [t("error.file_required")]);
      return;
    }

    logger.info("upload_image_classify", {
      component: "api.upload",
      filename: req.file.originalname,
      size: req.file.size,
      requestId: req.requestId,
    });

    imageClassifyTool
      .execute({
        data: req.file.buffer.toString("base64"),
        prompt: req.body?.prompt,
        model: req.body?.model,
      })
      .then((result) => {
        successResponse(res, result);
      })
      .catch((error: unknown) => {
        logger.error("upload_image_classify_failed", {
          component: "api.upload",
          error: String(error),
          requestId: req.requestId
        });
        rejectResponse(res, 500, t("error.internal_server_error"), [String(error)]);
      });
  });

  /**
   * POST /upload/speech-to-text — transcribe an uploaded audio file.
   *
   * Expects `multipart/form-data` with:
   * - `file` (required) — the audio file.
   * - `model` (optional) — override the STT model name.
   * - `language` (optional) — ISO 639-1 language hint (e.g. `"en"`).
   * - `prompt` (optional) — context/prompt for transcription.
   *
   * Response: `{ model, text }` where `text` is the transcribed content.
   */
  app.post("/upload/speech-to-text", upload.single("file"), (req, res) => {
    if (!req.file) {
      rejectResponse(res, 400, "Bad Request", [t("error.file_required")]);
      return;
    }

    logger.info("upload_speech_to_text", {
      component: "api.upload",
      filename: req.file.originalname,
      size: req.file.size,
      requestId: req.requestId,
    });

    speechToTextTool
      .execute({
        data: req.file.buffer.toString("base64"),
        filename: req.file.originalname,
        model: req.body?.model,
        language: req.body?.language,
        prompt: req.body?.prompt,
      })
      .then((result) => {
        successResponse(res, result);
      })
      .catch((error: unknown) => {
        logger.error("upload_speech_to_text_failed", {
          component: "api.upload",
          error: String(error),
          requestId: req.requestId
        });
        rejectResponse(res, 500, t("error.internal_server_error"), [String(error)]);
      });
  });

  /**
   * POST /upload/read-pdf — extract text from an uploaded PDF.
   *
   * Expects `multipart/form-data` with:
   * - `file` (required) — the PDF file.
   *
   * Response: `{ pageCount, text }` with the extracted content.
   */
  app.post("/upload/read-pdf", upload.single("file"), (req, res) => {
    if (!req.file) {
      rejectResponse(res, 400, "Bad Request", [t("error.file_required")]);
      return;
    }

    logger.info("upload_read_pdf", {
      component: "api.upload",
      filename: req.file.originalname,
      size: req.file.size,
      requestId: req.requestId,
    });

    readPdfTool
      .execute({
        data: req.file.buffer.toString("base64"),
      })
      .then((result) => {
        successResponse(res, result);
      })
      .catch((error: unknown) => {
        logger.error("upload_read_pdf_failed", { component: "api.upload", error: String(error), requestId: req.requestId });
        rejectResponse(res, 500, t("error.internal_server_error"), [String(error)]);
      });
  });

  logger.info("upload_routes_registered", {
    component: "api.upload",
    routes: ["/upload/image-classify", "/upload/speech-to-text", "/upload/read-pdf"],
  });
}
