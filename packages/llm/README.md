# @ai-assistant/llm

Thin wrapper around Ollama's local API, plus centralised embedding support.

## API

- `generate(prompt, options?)` → `Promise<string>`
- `generateWithMetadata(prompt, options?)` → `Promise<IGenerateResult>` — includes token counts, timings, and model name
- `getEmbedding(text, model?)` → `Promise<number[]>` — request an embedding vector from Ollama

Options for `generate` / `generateWithMetadata`:

- `model` (defaults to `OLLAMA_MODEL` or `llama3`)
- `stream` (defaults to `false`)
- `suffix` (optional code infill suffix)
- `system` (optional system prompt override)
- `format` (`json` or JSON schema object)
- `images` (optional base64 images for multimodal requests)
- `options` (optional provider-level parameters, e.g. `{ temperature: 0.2 }`)

## Environment variables

- `OLLAMA_BASE_URL` (default: `http://localhost:11434`)
- `OLLAMA_MODEL` (default: `llama3`)
- `OLLAMA_EMBED_MODEL` (default: `nomic-embed-text`)

## Key files

- `config.ts` — centralised Ollama configuration constants
- `embeddings.ts` — shared embedding API call
- `ollama.ts` — generate/generateWithMetadata Ollama REST wrapper
