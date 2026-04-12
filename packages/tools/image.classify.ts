import fs from "fs/promises";
import path from "path";
import { generate } from "../llm/ollama";
import type { Tool } from "./types";

const DEFAULT_VISION_MODEL = process.env.TOOL_VISION_MODEL ?? "llava-llama3";

function envFloat(value: string | undefined, fallback: number): number {
  const parsed = parseFloat(value ?? String(fallback));
  return Number.isNaN(parsed) ? fallback : parsed;
}

function envInt(value: string | undefined, fallback: number): number {
  const parsed = parseInt(value ?? String(fallback), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function resolveSafePath(filePath: string): string {
  const resolved = path.resolve(process.cwd(), filePath);
  const root = path.resolve(process.cwd());
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error("Access denied: path is outside the project root");
  }
  return resolved;
}

export const imageClassifyTool: Tool = {
  name: "image_classify",
  description:
    "Classify/describe an image with a vision model. " +
    "Input: { path: string, prompt?: string, model?: string }",

  async execute({ path: imagePath, prompt, model }) {
    if (typeof imagePath !== "string" || imagePath.trim() === "") {
      throw new Error('"path" must be a non-empty string');
    }

    const safePath = resolveSafePath(imagePath);
    const buffer = await fs.readFile(safePath);
    const base64Image = buffer.toString("base64");
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
      path: imagePath,
      response: response.trim(),
    };
  },
};
