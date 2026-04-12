# Ollama Models — Current Local List

This page reflects the current locally installed models for this project.

## Installed models (current)

| Model | Size |
|---|---|
| `starcoder2:15b` | 9.1 GB |
| `llava:13b` | 8.0 GB |
| `qwen3:32b` | 20 GB |
| `deepseek-r1:32b` | 19 GB |
| `qwen2.5-coder:32b` | 19 GB |
| `phi4-mini:latest` | 2.5 GB |
| `nomic-embed-text:latest` | 274 MB |
| `phi4-reasoning:14b` | 11 GB |
| `dolphin-llama3:70b` | 39 GB |
| `mixtral:8x7b` | 26 GB |
| `dolphin-phi:2.7b` | 1.6 GB |
| `llava-llama3:8b` | 5.5 GB |
| `llama3.1:8b` | 4.9 GB |
| `qwen3-coder:30b` | 18 GB |
| `deepseek-r1:14b` | 9.0 GB |
| `qwen3:4b` | 2.5 GB |

## Role-based picks (recommended)

- **General assistant (main):** `qwen3:32b`
- **Coding-heavy tasks (main):** `qwen2.5-coder:32b`
- **Reasoning-heavy tasks (main):** `deepseek-r1:32b`
- **Fast/low-latency utility:** `phi4-mini:latest` or `qwen3:4b`
- **Vision:** `llava:13b`
- **Embeddings (memory/search):** `nomic-embed-text:latest`

## Pull commands (if you need to restore)

```bash
ollama pull starcoder2:15b
ollama pull llava:13b
ollama pull qwen3:32b
ollama pull deepseek-r1:32b
ollama pull qwen2.5-coder:32b
ollama pull phi4-mini:latest
ollama pull nomic-embed-text:latest
ollama pull phi4-reasoning:14b
ollama pull dolphin-llama3:70b
ollama pull mixtral:8x7b
ollama pull dolphin-phi:2.7b
ollama pull llava-llama3:8b
ollama pull llama3.1:8b
ollama pull qwen3-coder:30b
ollama pull deepseek-r1:14b
ollama pull qwen3:4b
```

Reference libraries:
- https://ollama.com/library
- https://huggingface.co/
