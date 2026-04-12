import { generate } from "../llm/ollama";
import type { Tool } from "./types";

const DEFAULT_IDE_MODEL = process.env.TOOL_IDE_MODEL ?? process.env.AGENT_MODEL_CODE ?? "starcoder2";

function envFloat(value: string | undefined, fallback: number): number {
  const parsed = parseFloat(value ?? String(fallback));
  return Number.isNaN(parsed) ? fallback : parsed;
}

function envInt(value: string | undefined, fallback: number): number {
  const parsed = parseInt(value ?? String(fallback), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export const codeAutocompleteTool: Tool = {
  name: "code_autocomplete",
  description:
    "Generate code completion suggestions from prefix/suffix context. " +
    "Input: { prefix: string, suffix?: string, language?: string, model?: string }",

  async execute({ prefix, suffix, language, model }) {
    if (typeof prefix !== "string" || prefix.trim() === "") {
      throw new Error('"prefix" must be a non-empty string');
    }

    const usedModel = typeof model === "string" && model.trim() ? model : DEFAULT_IDE_MODEL;
    const usedLanguage =
      typeof language === "string" && language.trim() ? language.trim() : "plaintext";

    const prompt =
      `You are an IDE autocomplete engine.\n` +
      `Return only the code continuation.\n` +
      `Language: ${usedLanguage}\n` +
      `Code before cursor:\n${prefix}`;

    const completion = await generate(prompt, {
      model: usedModel,
      stream: false,
      suffix: typeof suffix === "string" && suffix.trim() ? suffix : undefined,
      options: {
        temperature: envFloat(process.env.TOOL_IDE_TEMPERATURE, 0.1),
        top_p: envFloat(process.env.TOOL_IDE_TOP_P, 0.7),
        top_k: envInt(process.env.TOOL_IDE_TOP_K, 10),
        num_ctx: envInt(process.env.TOOL_IDE_NUM_CTX, 8192),
        repeat_penalty: envFloat(process.env.TOOL_IDE_REPEAT_PENALTY, 1.2),
      },
    });

    return {
      model: usedModel,
      language: usedLanguage,
      completion: completion.trim(),
    };
  },
};
