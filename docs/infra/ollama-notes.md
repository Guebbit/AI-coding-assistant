# Ollama Notes — Brief but Complete

::: tip TL;DR
Quick reference for Ollama setup: GPU drivers, container runtime, model management, VRAM expectations.
:::

This page is a compact reference for running Ollama locally, understanding key LLM concepts, and avoiding common setup mistakes.

## Core concepts in plain words

### Weights

- Weights are the learned numbers inside the model.
- They store what the model has learned during training.
- Changing weights means retraining or fine-tuning.

### Quantization

- Quantization compresses weights (for example Q4, Q5, Q6).
- Benefit: much lower VRAM usage and faster loading.
- Tradeoff: slight quality loss at lower bit precision.

### Tokens

- Models process text as tokens (word pieces, not full words).
- Context window = max input + output tokens per request.
- Large prompts + large responses increase memory usage.

## VRAM expectations (quick reference)

Approximate ranges depend on model family and quantization:

| Model class | Typical VRAM need (quantized) | Notes                                               |
| ----------- | ----------------------------: | --------------------------------------------------- |
| 1B–4B       |                           Low | Good for first tests and weak hardware              |
| 7B–8B       |                        Medium | Strong default for daily local usage                |
| 13B         |                   Medium-high | Usually one model loaded at a time on 24 GB         |
| 30B+        |                          High | Can become unstable on consumer single-GPU setups   |
| 70B         |                     Very high | Usually requires multi-GPU or remote infrastructure |

Practical rule on 24 GB VRAM:

- Safe: one 7B–13B quantized model
- Risky: 30B quantized
- Usually unrealistic locally: 70B

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
- `OLLAMA_MAX_LOADED_MODELS=1`: avoids VRAM overload
- `OLLAMA_NUM_PARALLEL=1`: safer for constrained systems

This repository's compose file is `infra/podman/docker-compose.yml`; use that path whenever docs mention the Ollama/Open WebUI compose setup.

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

## Customization options (what is realistic locally)

### LoRA / Fine-tuning

- Modifies behavior with adapter layers
- Useful for style/domain adaptation
- More practical than full retraining

### RAG (Retrieval-Augmented Generation)

- Does not change weights
- Injects your own documents at query time
- Best for private knowledge and frequently updated data

### Full training from scratch

- Usually not realistic on single consumer GPUs

## Troubleshooting

### GPU not used

- Check `nvidia-smi`
- Check container has GPU access
- Inspect container logs for CUDA detection

### Out-of-memory (OOM)

- Use smaller model or lower quantization footprint
- Keep `OLLAMA_MAX_LOADED_MODELS=1`
- Reduce context size and output tokens

### Slow response

- Confirm not falling back to CPU
- Reduce model size
- Reduce concurrent workloads on host

## Useful links

- Ollama model library: https://ollama.com/library
- Hugging Face model pages: https://huggingface.co/
