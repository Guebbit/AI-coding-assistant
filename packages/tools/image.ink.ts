import fs from "fs/promises";
import path from "path";
import { generate } from "../llm/ollama";
import type { Tool } from "./types";

const DEFAULT_VISION_MODEL = process.env.TOOL_VISION_MODEL ?? "llava-llama3";

function resolveSafePath(filePath: string): string {
  const resolved = path.resolve(process.cwd(), filePath);
  const root = path.resolve(process.cwd());
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error("Access denied: path is outside the project root");
  }
  return resolved;
}

export const imageInkTool: Tool = {
  name: "image_ink",
  description:
    "Analyze a sketch image and describe how it would look when inked (clean line art). " +
    "Input: { path: string, model?: string }",

  async execute({ path: imagePath, model }) {
    if (typeof imagePath !== "string" || imagePath.trim() === "") {
      throw new Error('"path" must be a non-empty string');
    }

    const safePath = resolveSafePath(imagePath);
    const buffer = await fs.readFile(safePath);
    const base64Image = buffer.toString("base64");
    const usedModel = typeof model === "string" && model.trim() ? model : DEFAULT_VISION_MODEL;

    const prompt =
      "You are an expert illustration assistant. This image is a hand-drawn sketch. " +
      "Describe in detail how this sketch would look as a clean, inked line drawing: " +
      "which lines should be bold or thin, where shadows and hatching would appear, " +
      "and how the final inked version would differ from the rough sketch. " +
      "Be specific about line weights, contours, and inking style.";

    const response = await generate(prompt, {
      model: usedModel,
      stream: false,
      images: [base64Image],
    });

    return {
      model: usedModel,
      path: imagePath,
      inkingDescription: response.trim(),
    };
  },
};
