/**
 * Minimal wrapper around the Ollama local LLM API.
 * Deliberately simple — one function, one responsibility.
 *
 * Ollama docs: https://github.com/ollama/ollama/blob/main/docs/api.md
 */

const OLLAMA_BASE_URL =
  process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";

const DEFAULT_MODEL = process.env.OLLAMA_MODEL ?? "llama3";

export interface GenerateOptions {
  /** Ollama model name (default: llama3 or OLLAMA_MODEL env var) */
  model?: string;
  /** Whether to stream the response (default: false) */
  stream?: boolean;
}

/**
 * Send a prompt to Ollama and return the full text response.
 *
 * @param prompt - The prompt to send
 * @param options - Optional overrides for model and streaming
 */
export async function generate(
  prompt: string,
  options: GenerateOptions = {}
): Promise<string> {
  const { model = DEFAULT_MODEL, stream = false } = options;

  const res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, stream }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Ollama API error: ${res.status} ${res.statusText}${body ? ` — ${body}` : ""}`
    );
  }

  const data = (await res.json()) as { response: string };
  return data.response;
}
