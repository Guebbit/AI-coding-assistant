import fs from "fs/promises";
import path from "path";
import type { Tool } from "./types";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const DEFAULT_STT_MODEL = process.env.TOOL_STT_MODEL ?? "whisper";

function resolveSafePath(filePath: string): string {
  const resolved = path.resolve(process.cwd(), filePath);
  const root = path.resolve(process.cwd());
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error("Access denied: path is outside the project root");
  }
  return resolved;
}

export const speechToTextTool: Tool = {
  name: "speech_to_text",
  description:
    "Transcribe an audio file using Ollama OpenAI-compatible transcription endpoint. " +
    "Input: { path: string, model?: string, language?: string, prompt?: string }",

  async execute({ path: audioPath, model, language, prompt }) {
    if (typeof audioPath !== "string" || audioPath.trim() === "") {
      throw new Error('"path" must be a non-empty string');
    }

    const safePath = resolveSafePath(audioPath);
    const data = await fs.readFile(safePath);
    if (data.length === 0) {
      throw new Error("Audio file is empty");
    }

    const usedModel = typeof model === "string" && model.trim() ? model : DEFAULT_STT_MODEL;
    const form = new FormData();
    form.append("model", usedModel);
    if (typeof language === "string" && language.trim()) {
      form.append("language", language);
    }
    if (typeof prompt === "string" && prompt.trim()) {
      form.append("prompt", prompt);
    }
    form.append("file", new Blob([data]), path.basename(safePath));

    const res = await fetch(`${OLLAMA_BASE_URL}/v1/audio/transcriptions`, {
      method: "POST",
      body: form,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Ollama transcription error: ${res.status} ${res.statusText}${body ? ` — ${body}` : ""}`
      );
    }

    const parsed = (await res.json()) as { text?: string };
    return {
      model: usedModel,
      path: audioPath,
      text: parsed.text ?? "",
    };
  },
};
