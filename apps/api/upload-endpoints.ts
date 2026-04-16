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
 * - `POST /upload/image-sketch`    — sketch/line-art transform of an uploaded image.
 * - `POST /upload/image-colorize`  — colorize transform of an uploaded image.
 * - `POST /upload/speech-to-text`  — transcribe an uploaded audio file.
 * - `POST /upload/read-pdf`        — extract text from an uploaded PDF.
 *
 * All endpoints use `multer` with in-memory storage and a 50 MB limit.
 *
 * @module apps/api/upload-endpoints
 */

import type express from "express";
import type { Request, Response } from "express";
import {
  imageClassifyTool,
  imageSketchTool,
  imageColorizeTool,
  speechToTextTool,
  readPdfTool
} from "@/packages/tools/index";
import { logger } from "@/packages/logger/logger";
import { type IResponseMeta, rejectResponse, successResponse, t } from "@/packages/shared";
import type { ImageProcessorResponse } from "@/api/models";
import { upload } from "./middlewares/multer";

/**
 * Send either raw PNG bytes or JSON metadata based on the `Accept` header.
 *
 * When `Accept` includes `image/png`, the endpoint returns image bytes directly.
 * Otherwise it returns the full JSON payload produced by the tool.
 *
 * @param request - Express request (used for content negotiation).
 * @param response - Express response object.
 * @param result - Image-processing result payload.
 */
function sendImageOrJson(
  request: Request,
  response: Response,
  result: ImageProcessorResponse,
  meta?: IResponseMeta
): void {
  if (request.headers.accept?.includes("image/png")) {
    response.status(200).type("image/png").send(Buffer.from(result.image, "base64"));
    return;
  }

  successResponse(response, result, 200, "", meta);
}

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
    const startedAt = new Date();
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
        successResponse(res, result, 200, "", {
          startedAt: startedAt.toISOString(),
          durationMs: Date.now() - startedAt.getTime(),
          requestId: req.requestId,
        });
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
   * POST /upload/image-sketch — generate a sketch/line-art version of an uploaded image.
   *
   * Expects `multipart/form-data` with:
   * - `file` (required) — the source image.
   * - `prompt` (optional) — custom positive prompt.
   * - `negative_prompt` (optional) — custom negative prompt.
   *
   * Response:
   * - `image/png` when `Accept: image/png`
   * - JSON `{ image, duration_ms, model }` otherwise.
   */
  app.post("/upload/image-sketch", upload.single("file"), (req, res) => {
    const startedAt = new Date();
    if (!req.file) {
      rejectResponse(res, 400, "Bad Request", [t("error.file_required")]);
      return;
    }

    logger.info("upload_image_sketch", {
      component: "api.upload",
      filename: req.file.originalname,
      size: req.file.size,
      requestId: req.requestId,
    });

    imageSketchTool
      .execute({
        image: req.file.buffer.toString("base64"),
        prompt: req.body?.prompt,
        negative_prompt: req.body?.negative_prompt,
      })
      .then((result) => {
        sendImageOrJson(req, res, result as ImageProcessorResponse, {
          startedAt: startedAt.toISOString(),
          durationMs: Date.now() - startedAt.getTime(),
          requestId: req.requestId,
          model: (result as ImageProcessorResponse).model,
        });
      })
      .catch((error: unknown) => {
        logger.error("upload_image_sketch_failed", {
          component: "api.upload",
          error: String(error),
          requestId: req.requestId
        });
        rejectResponse(res, 500, t("error.internal_server_error"), [String(error)]);
      });
  });

  /**
   * POST /upload/image-colorize — colorize an uploaded image.
   *
   * Expects `multipart/form-data` with:
   * - `file` (required) — the source image.
   * - `prompt` (optional) — custom positive prompt.
   * - `negative_prompt` (optional) — custom negative prompt.
   *
   * Response:
   * - `image/png` when `Accept: image/png`
   * - JSON `{ image, duration_ms, model }` otherwise.
   */
  app.post("/upload/image-colorize", upload.single("file"), (req, res) => {
    const startedAt = new Date();
    if (!req.file) {
      rejectResponse(res, 400, "Bad Request", [t("error.file_required")]);
      return;
    }

    logger.info("upload_image_colorize", {
      component: "api.upload",
      filename: req.file.originalname,
      size: req.file.size,
      requestId: req.requestId,
    });

    imageColorizeTool
      .execute({
        image: req.file.buffer.toString("base64"),
        prompt: req.body?.prompt,
        negative_prompt: req.body?.negative_prompt,
      })
      .then((result) => {
        sendImageOrJson(req, res, result as ImageProcessorResponse, {
          startedAt: startedAt.toISOString(),
          durationMs: Date.now() - startedAt.getTime(),
          requestId: req.requestId,
          model: (result as ImageProcessorResponse).model,
        });
      })
      .catch((error: unknown) => {
        logger.error("upload_image_colorize_failed", {
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
    const startedAt = new Date();
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
        successResponse(res, result, 200, "", {
          startedAt: startedAt.toISOString(),
          durationMs: Date.now() - startedAt.getTime(),
          requestId: req.requestId,
        });
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
    const startedAt = new Date();
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
        successResponse(res, result, 200, "", {
          startedAt: startedAt.toISOString(),
          durationMs: Date.now() - startedAt.getTime(),
          requestId: req.requestId,
        });
      })
      .catch((error: unknown) => {
        logger.error("upload_read_pdf_failed", { component: "api.upload", error: String(error), requestId: req.requestId });
        rejectResponse(res, 500, t("error.internal_server_error"), [String(error)]);
      });
  });

  logger.info("upload_routes_registered", {
    component: "api.upload",
    routes: [
      "/upload/image-classify",
      "/upload/image-sketch",
      "/upload/image-colorize",
      "/upload/speech-to-text",
      "/upload/read-pdf",
    ],
  });
}
