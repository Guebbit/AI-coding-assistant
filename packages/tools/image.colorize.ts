import fs from "fs/promises";
import path from "path";
import { generate } from "../llm/ollama";
import type { Tool } from "./types";

const DEFAULT_VISION_MODEL = process.env.TOOL_VISION_MODEL ?? "llava-llama3";

export type SketchState = "sketch" | "inked" | "unknown";

function resolveSafePath(filePath: string): string {
  const resolved = path.resolve(process.cwd(), filePath);
  const root = path.resolve(process.cwd());
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error("Access denied: path is outside the project root");
  }
  return resolved;
}

export async function classifySketchState(
  base64Image: string,
  model: string,
): Promise<SketchState> {
  const classifyPrompt =
    "Look at this image carefully. Is it: " +
    "(A) a rough pencil/pen sketch or hand-drawn draft with loose, unfinished lines, " +
    "(B) a clean inked drawing with clear, deliberate line art (possibly in black and white or with ink), or " +
    "(C) something else (a photo, a fully painted image, etc.)? " +
    'Reply with exactly one word: "sketch", "inked", or "unknown".';

  const raw = await generate(classifyPrompt, {
    model,
    stream: false,
    images: [base64Image],
    options: { temperature: 0.1 },
  });

  const lower = raw.trim().toLowerCase();
  if (lower.includes("sketch")) return "sketch";
  if (lower.includes("inked")) return "inked";
  return "unknown";
}

export const imageColorizeTool: Tool = {
  name: "image_colorize",
  description:
    "Analyze an image (sketch or inked drawing) and describe a detailed colorization plan. " +
    "Input: { path: string, sketchState?: 'sketch' | 'inked' | 'unknown', model?: string }",

  async execute({ path: imagePath, sketchState, model }) {
    if (typeof imagePath !== "string" || imagePath.trim() === "") {
      throw new Error('"path" must be a non-empty string');
    }

    const safePath = resolveSafePath(imagePath);
    const buffer = await fs.readFile(safePath);
    const base64Image = buffer.toString("base64");
    const usedModel = typeof model === "string" && model.trim() ? model : DEFAULT_VISION_MODEL;

    let resolvedState: SketchState =
      sketchState === "sketch" || sketchState === "inked" ? sketchState : "unknown";

    if (resolvedState === "unknown") {
      resolvedState = await classifySketchState(base64Image, usedModel);
    }

    const colorPrompt =
      resolvedState === "sketch"
        ? "You are an expert colorist. This image is a rough sketch. " +
          "First describe how you would ink this sketch (line weights, contours, style), " +
          "then describe in detail how you would colorize it: " +
          "which color palette to use, where shadows and highlights go, " +
          "the mood and style of the final colored illustration."
        : "You are an expert colorist. This image is a clean inked drawing. " +
          "Describe in detail how you would colorize it: " +
          "which color palette to use, where to place shadows and highlights, " +
          "the overall mood, lighting direction, and illustration style.";

    const response = await generate(colorPrompt, {
      model: usedModel,
      stream: false,
      images: [base64Image],
    });

    return {
      model: usedModel,
      path: imagePath,
      detectedState: resolvedState,
      colorizationDescription: response.trim(),
    };
  },
};
