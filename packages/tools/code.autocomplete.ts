import { generate } from "../llm/ollama";
import type { Tool } from "./types";

const DEFAULT_IDE_MODEL = process.env.TOOL_IDE_MODEL ?? process.env.AGENT_MODEL_CODE ?? "qwen3-coder:14b";

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
    });

    return {
      model: usedModel,
      language: usedLanguage,
      completion: completion.trim(),
    };
  },
};
