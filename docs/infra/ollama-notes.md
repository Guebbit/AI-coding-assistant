# Ollama Setup & Reference

::: tip TL;DR
Quick reference for running Ollama locally. For LLM concepts, see the [Glossary](/glossary).
:::

## Setup prerequisites

- Linux + NVIDIA driver
- Container runtime (Podman or Docker)
- NVIDIA container toolkit (for GPU passthrough)

Validate GPU visibility:

```bash
nvidia-smi
```

## Start Ollama container (Podman example)

```bash
podman run -d \
  --name ollama \
  --gpus=all \
  -v ~/path/to/ollama:/root/.ollama \
  -p 9191:11434 \
  -e OLLAMA_MAX_LOADED_MODELS=1 \
  -e OLLAMA_NUM_PARALLEL=1 \
  ollama/ollama
```

What matters:

- `--gpus=all`: enables CUDA acceleration
- persistent volume: keeps downloaded models
- `OLLAMA_MAX_LOADED_MODELS=1`: avoids [VRAM](/glossary#vram) overload
- `OLLAMA_NUM_PARALLEL=1`: safer for constrained systems

This repository's compose file is `docker-compose.yml` at the repo root; use that path whenever docs mention the Ollama/Open WebUI compose setup.

## Day-to-day Ollama usage

```bash
ollama pull <model>
ollama list
ollama run <model>
```

Inside a chat session:

- Ask prompts normally
- `/bye` to exit

For first validation, use a small model first, then scale up.

## VRAM expectations (quick reference)

Approximate ranges depend on model family and [quantization](/glossary#quantization):

| Model class | Typical [VRAM](/glossary#vram) need (quantized) | Notes                                               |
| ----------- | ----------------------------------------------: | --------------------------------------------------- |
| 1B–4B       |                                             Low | Good for first tests and weak hardware              |
| 7B–8B       |                                          Medium | Strong default for daily local usage                |
| 13B         |                                     Medium-high | Usually one model loaded at a time on 24 GB         |
| 30B+        |                                            High | Can become unstable on consumer single-GPU setups   |
| 70B         |                                       Very high | Usually requires multi-GPU or remote infrastructure |

Practical rule on 24 GB [VRAM](/glossary#vram):

- Safe: one 7B–13B [quantized](/glossary#quantization) model
- Risky: 30B quantized
- Usually unrealistic locally: 70B

## Customization options

- **LoRA / Fine-tuning** → [Theory](/theory/lora-fine-tuning) | [Practical guide](/theory/lora-practical)
- **RAG** → [Theory](/theory/RAG) | [Library Ingestion](/library-ingestion)
- **Modelfile** → [Modelfile Example](/infra/modelfile-example)

## Troubleshooting

### GPU not used

- Check `nvidia-smi`
- Check container has GPU access
- Inspect container logs for CUDA detection

### Out-of-memory (OOM)

- Use smaller model or lower [quantization](/glossary#quantization) footprint
- Keep `OLLAMA_MAX_LOADED_MODELS=1`
- Reduce [context](/glossary#context-window) size and output [tokens](/glossary#token)

### Slow response

- Confirm not falling back to CPU
- Reduce model size
- Reduce concurrent workloads on host

## Useful links

- Ollama model library: https://ollama.com/library
- Hugging Face model pages: https://huggingface.co/

## Key concepts

For full definitions, see the [Glossary](/glossary):

[Weights](/glossary#weights) · [Quantization](/glossary#quantization) · [Tokens](/glossary#token) · [Context Window](/glossary#context-window) · [VRAM](/glossary#vram)
