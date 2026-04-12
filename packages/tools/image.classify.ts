/**
 * Image classification / description tool.
 *
 * Accepts an image from disk (`path`) **or** as inline base64 data
 * (`data`), sends it to a multimodal (vision) model via Ollama, and
 * returns a textual description or classification.
 *
 * When both `path` and `data` are provided, `data` takes precedence.
 *
 * Uses the shared `resolveSafePath` helper to prevent path traversal.
 * Uses the shared `envFloat` / `envInt` helpers for option parsing.
 *
 * @module tools/image.classify
 */

import fs from "fs/promises";
import { generate } from "../llm/ollama";
import type { Tool } from "./types";
import { resolveSafePath, envFloat, envInt } from "../shared";

/** Default vision model, configurable via environment variable. */
const DEFAULT_VISION_MODEL = process.env.TOOL_VISION_MODEL ?? "llava-llama3";

/**
 * Tool instance for classifying / describing images.
 *
 * Input (disk):
 * ```json
 * { "path": "images/photo.jpg", "prompt": "What is this?", "model": "llava:13b" }
 * ```
 *
 * Input (inline base64):
 * ```json
 * { "data": "<base64-encoded image>", "prompt": "What is this?", "model": "llava:13b" }
 * ```
 */
export const imageClassifyTool: Tool = {
  name: "image_classify",
  description:
    "Classify/describe an image with a vision model. " +
    "Input: { path?: string, data?: string (base64), prompt?: string, model?: string }. " +
    "Provide either path (file on disk) or data (base64-encoded image).",

  /**
   * Read the image (from disk or inline base64) and ask the vision model.
   *
   * @param input        - Tool input object.
   * @param input.path   - Path to the image file (relative to project root). Required unless `data` is provided.
   * @param input.data   - Base64-encoded image content. Takes precedence over `path`.
   * @param input.prompt - Optional custom prompt (defaults to a generic "describe this image" prompt).
   * @param input.model  - Optional override for the vision model name.
   * @returns `{ model, path, response }` where `response` is the model's description.
   * @throws {Error} When neither `path` nor `data` is provided.
   */
  async execute({ path: imagePath, data, prompt, model }) {
    let base64Image: string;

    if (typeof data === "string" && data.trim() !== "") {
      base64Image = data;
    } else if (typeof imagePath === "string" && imagePath.trim() !== "") {
      const safePath = resolveSafePath(imagePath);
      const buffer = await fs.readFile(safePath);
      base64Image = buffer.toString("base64");
    } else {
      throw new Error('Either "path" (file on disk) or "data" (base64 string) must be provided');
    }

    const usedModel = typeof model === "string" && model.trim() ? model : DEFAULT_VISION_MODEL;
    const usedPrompt =
      typeof prompt === "string" && prompt.trim()
        ? prompt
        : "Describe this image and identify what it most likely contains.";

    const response = await generate(usedPrompt, {
      model: usedModel,
      stream: false,
      images: [base64Image],
      options: {
        temperature: envFloat(process.env.TOOL_VISION_TEMPERATURE, 0.2),
        top_p: envFloat(process.env.TOOL_VISION_TOP_P, 0.8),
        top_k: envInt(process.env.TOOL_VISION_TOP_K, 20),
        num_ctx: envInt(process.env.TOOL_VISION_NUM_CTX, 4096),
        repeat_penalty: envFloat(process.env.TOOL_VISION_REPEAT_PENALTY, 1.3),
      },
    });

    return {
      model: usedModel,
      path: typeof imagePath === "string" ? imagePath : undefined,
      response: response.trim(),
    };
  },
};
