# llm — The AI Model Connection

## What

Talks to Ollama via HTTP.

## Role

Send prompt → get model response.

## Why simple matters

This package is intentionally thin. It keeps model I/O isolated so the rest of the system stays clean.

## API

- `generate(prompt, options?) => Promise<string>`

Options:

- `model` (default `OLLAMA_MODEL` or `llama3`)
- `stream` (default `false`)
- `suffix` (optional, code-infill/completion)
- `system` (optional system prompt override)
- `format` (`json` or JSON schema)
- `images` (optional base64 images for multimodal models)

## Environment variables

- `OLLAMA_BASE_URL` (default `http://localhost:11434`)
- `OLLAMA_MODEL` (default `llama3`)

## Where in code

- `packages/llm/ollama.ts`
