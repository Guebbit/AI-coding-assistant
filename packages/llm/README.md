# @ai-assistant/llm

Thin wrapper around Ollama's local API.

## API

- `generate(prompt, options?)` → `Promise<string>`

Options:

- `model` (defaults to `OLLAMA_MODEL` or `llama3`)
- `stream` (defaults to `false`)
- `suffix` (optional code infill suffix)
- `system` (optional system prompt override)
- `format` (`json` or JSON schema object)
- `images` (optional base64 images for multimodal requests)

## Environment variables

- `OLLAMA_BASE_URL` (default: `http://localhost:11434`)
- `OLLAMA_MODEL` (default: `llama3`)

## Key file

- `ollama.ts`
