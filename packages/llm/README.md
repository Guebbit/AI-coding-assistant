# @ai-assistant/llm

Thin wrapper around Ollama's local API.

## API

- `generate(prompt, options?)` → `Promise<string>`

Options:

- `model` (defaults to `OLLAMA_MODEL` or `llama3`)
- `stream` (defaults to `false`)

## Environment variables

- `OLLAMA_BASE_URL` (default: `http://localhost:11434`)
- `OLLAMA_MODEL` (default: `llama3`)

## Key file

- `src/ollama.ts`
