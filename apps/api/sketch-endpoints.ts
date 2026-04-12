import type express from "express";
import { randomUUID } from "node:crypto";
import multer from "multer";
import { generate } from "../../packages/llm/ollama";
import { classifySketchState } from "../../packages/tools/image.colorize";
import type { SketchState } from "../../packages/tools/image.colorize";
import { getLogger } from "../../packages/logger/logger";

const log = getLogger("api-sketch");

const DEFAULT_VISION_MODEL = process.env.TOOL_VISION_MODEL ?? "llava-llama3";

const SKETCH_TIMEOUT_MS = Number.parseInt(process.env.SKETCH_TIMEOUT_MS ?? "60000", 10);

const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed: PNG, JPG, WEBP, GIF`));
    }
  },
});

async function withTimeout<T>(work: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const handle = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    void work
      .then((result) => {
        clearTimeout(handle);
        resolve(result);
      })
      .catch((err: unknown) => {
        clearTimeout(handle);
        reject(err);
      });
  });
}

async function describeInking(base64Image: string, model: string): Promise<string> {
  const prompt =
    "You are an expert illustration assistant. This image is a hand-drawn sketch. " +
    "Describe in detail how this sketch would look as a clean, inked line drawing: " +
    "which lines should be bold or thin, where shadows and hatching would appear, " +
    "and how the final inked version would differ from the rough sketch. " +
    "Be specific about line weights, contours, and inking style.";

  return generate(prompt, {
    model,
    stream: false,
    images: [base64Image],
  });
}

async function describeColorization(
  base64Image: string,
  detectedState: SketchState,
  model: string,
): Promise<string> {
  const prompt =
    detectedState === "sketch"
      ? "You are an expert colorist. This image is a rough sketch. " +
        "First describe how you would ink this sketch (line weights, contours, style), " +
        "then describe in detail how you would colorize it: " +
        "which color palette to use, where shadows and highlights go, " +
        "the mood and style of the final colored illustration."
      : "You are an expert colorist. This image is a clean inked drawing. " +
        "Describe in detail how you would colorize it: " +
        "which color palette to use, where to place shadows and highlights, " +
        "the overall mood, lighting direction, and illustration style.";

  return generate(prompt, {
    model,
    stream: false,
    images: [base64Image],
  });
}

export function registerSketchRoutes(application: express.Express): void {
  /**
   * POST /ink
   *
   * Accept a sketch image and return a description of the inked version.
   * Multipart form: field name "image" (PNG, JPG, WEBP, GIF; max 10 MB).
   * Optional form field: "model" to override the vision model.
   */
  application.post("/ink", upload.single("image"), async (request, response) => {
    const requestId = randomUUID();
    const startedAt = Date.now();

    if (!request.file) {
      response.status(400).json({
        requestId,
        error: 'No image file uploaded. Send a multipart form with field name "image".',
      });
      return;
    }

    const model =
      typeof request.body?.model === "string" && request.body.model.trim()
        ? request.body.model.trim()
        : DEFAULT_VISION_MODEL;

    try {
      const base64Image = request.file.buffer.toString("base64");

      const inkingDescription = await withTimeout(
        describeInking(base64Image, model),
        SKETCH_TIMEOUT_MS,
        "ink",
      );

      response.json({
        requestId,
        model,
        originalName: request.file.originalname,
        inkingDescription: inkingDescription.trim(),
        latencyMs: Date.now() - startedAt,
      });
    } catch (error) {
      log.error("ink_failed", { requestId, error: String(error) });
      response.status(500).json({ requestId, error: String(error) });
    }
  });

  /**
   * POST /ink-and-color
   *
   * Accept any image and intelligently process it:
   * - If the image is a sketch: describe how to ink AND colorize it.
   * - If the image is an inked drawing: describe how to colorize it only.
   * Uses image classification to determine the sketch state automatically.
   *
   * Multipart form: field name "image" (PNG, JPG, WEBP, GIF; max 10 MB).
   * Optional form fields:
   *   "model"       — override the vision model
   *   "sketchState" — skip classification; pass "sketch" or "inked" explicitly
   */
  application.post("/ink-and-color", upload.single("image"), async (request, response) => {
    const requestId = randomUUID();
    const startedAt = Date.now();

    if (!request.file) {
      response.status(400).json({
        requestId,
        error: 'No image file uploaded. Send a multipart form with field name "image".',
      });
      return;
    }

    const model =
      typeof request.body?.model === "string" && request.body.model.trim()
        ? request.body.model.trim()
        : DEFAULT_VISION_MODEL;

    const providedState = request.body?.sketchState as string | undefined;
    const initialState: SketchState =
      providedState === "sketch" || providedState === "inked" ? providedState : "unknown";

    try {
      const base64Image = request.file.buffer.toString("base64");

      const detectedState: SketchState =
        initialState !== "unknown"
          ? initialState
          : await withTimeout(
              classifySketchState(base64Image, model),
              SKETCH_TIMEOUT_MS,
              "ink-and-color classification",
            );

      const colorizationDescription = await withTimeout(
        describeColorization(base64Image, detectedState, model),
        SKETCH_TIMEOUT_MS,
        "ink-and-color",
      );

      response.json({
        requestId,
        model,
        originalName: request.file.originalname,
        detectedState,
        colorizationDescription: colorizationDescription.trim(),
        latencyMs: Date.now() - startedAt,
      });
    } catch (error) {
      log.error("ink_and_color_failed", { requestId, error: String(error) });
      response.status(500).json({ requestId, error: String(error) });
    }
  });
}
