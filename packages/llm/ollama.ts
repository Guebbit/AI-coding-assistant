/**
 * Minimal wrapper around the Ollama local LLM API.
 * Deliberately simple — one function, one responsibility.
 *
 * Ollama docs: https://github.com/ollama/ollama/blob/main/docs/api.md
 */

const OLLAMA_BASE_URL =
  process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";

export interface GenerateOptions {
  /** Ollama model name (default: llama3 or OLLAMA_MODEL env var) */
  model?: string;
  /** Whether to stream the response (default: false) */
  stream?: boolean;
  /** Optional text suffix for infill/completion use-cases */
  suffix?: string;
  /** Optional system prompt override */
  system?: string;
  /** Optional response format (`json` or JSON schema object) */
  format?: "json" | Record<string, unknown>;
  /** Base64-encoded images for multimodal models */
  images?: string[];
}

export interface GenerateResult {
  response: string;
  model: string;
  done: boolean;
  doneReason?: string;
  totalDurationNs?: number;
  loadDurationNs?: number;
  promptEvalCount?: number;
  promptEvalDurationNs?: number;
  evalCount?: number;
  evalDurationNs?: number;
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
  const result = await generateWithMetadata(prompt, options);
  return result.response;
}

export async function generateWithMetadata(
  prompt: string,
  options: GenerateOptions = {}
): Promise<GenerateResult> {
  const {
    model = process.env.OLLAMA_MODEL ?? "llama3",
    stream = false,
    suffix,
    system,
    format,
    images,
  } = options;

  const res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      stream,
      suffix,
      system,
      format,
      images,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Ollama API error: ${res.status} ${res.statusText}${body ? ` — ${body}` : ""}`
    );
  }

  const data = (await res.json()) as {
    response: string;
    model?: string;
    done?: boolean;
    done_reason?: string;
    total_duration?: number;
    load_duration?: number;
    prompt_eval_count?: number;
    prompt_eval_duration?: number;
    eval_count?: number;
    eval_duration?: number;
  };

  return {
    response: data.response,
    model: data.model ?? model,
    done: data.done ?? true,
    doneReason: data.done_reason,
    totalDurationNs: data.total_duration,
    loadDurationNs: data.load_duration,
    promptEvalCount: data.prompt_eval_count,
    promptEvalDurationNs: data.prompt_eval_duration,
    evalCount: data.eval_count,
    evalDurationNs: data.eval_duration,
  };
}
