# Ollama Models — RTX 4090 Optimized List

This page lists the local models expected for this project from your mounted Ollama volume (for example `- /home/${LINUX_USERNAME}/.ollama:/root/.ollama:z,rw`).

## Removed from the project list

- `deepseek-coder-v2:16b`
- `llama2-uncensored:7b`
- `phi3:3.8b`
- `phi4-mini:3.8b` (legacy tag; current pull command in this docs is `ollama pull phi4-mini`)
- `qwen3-4b-balanced`
- `qwen3-4b-drunk`
- `qwen3-4b-serious`
- `qwen3-coder-30b-safe:latest`
- `qwencoder-30b-safe:latest`

## Added / upgraded models

### Reasoning (main)
```bash
ollama pull deepseek-r1:32b
```

### General assistant (main)
```bash
ollama pull qwen3:32b
```

### Coding (main upgrade)
```bash
ollama pull qwen2.5-coder:32b
```

### Vision (upgrade)
```bash
ollama pull llava:13b
```

### Embeddings (required for memory/search)
```bash
ollama pull nomic-embed-text
```

### Fast utility model (optional but useful)
```bash
ollama pull phi4-mini
```

### IDE assistant (future WebStorm usage)
```bash
ollama pull starcoder2
```

## Final optimized setup

### Thinking / reasoning
- `deepseek-r1:32b` ⭐ main brain
- `mixtral:8x7b` fallback

### General assistant
- `qwen3:32b` ⭐
- `llama3.1:8b` fast chat

### Coding
- `qwen2.5-coder:32b` ⭐
- `qwen3-coder:30b` secondary
- `qwencoder-30b-safe` optional redundancy
- `starcoder2` reserved for WebStorm IDE assistant workflows

### Vision
- `llava:13b` ⭐

### Search / memory
- `nomic-embed-text` ⭐

### Fast tools
- `phi4-mini`

### Heavy “brain tank”
- `dolphin-llama3:70b` (optional if slow inference is acceptable)

Reference libraries:
- https://ollama.com/library
- https://huggingface.co/
