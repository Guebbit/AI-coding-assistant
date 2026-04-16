# Models + hardware (machine reference)

Hardware constraints: CPU AMD Ryzen 9 9950X3D (16C/32T), RAM 32 GB DDR5, GPU RTX 4090 (24 GB VRAM), storage NVMe PCIe 5.0 + 4.0; prefer models fitting fully in 24 GB VRAM (RAM offload reduces throughput/latency).

Recommended defaults

- `OLLAMA_MODEL=llama3.1:8b-instruct-q8_0`
- `AGENT_MODEL_FAST=llama3.1:8b-instruct-q8_0`
- `AGENT_MODEL_REASONING=deepseek-r1:32b-qwen-distill-q4_K_M`
- `AGENT_MODEL_CODE=qwen2.5-coder:14b-instruct-q8_0`
- `AGENT_MODEL_DEFAULT=llama3.1:8b-instruct-q8_0`
- `AGENT_MODEL_ROUTER_MODEL=phi4-mini:latest`
- `OLLAMA_EMBED_MODEL=nomic-embed-text`
- `TOOL_VISION_MODEL=llava:13b-v1.6-vicuna-q4_K_M`
- `TOOL_STT_MODEL=whisper`
- `TOOL_IDE_MODEL=qwen2.5-coder:7b-instruct-q8_0`
- `TOOL_DIAGRAM_MODEL=qwen2.5-coder:14b-instruct-q8_0`

Selection rules

1. Prefer full on-GPU fit
2. Latency-critical (`fast`, IDE): smaller/faster model
3. `reasoning`: largest model that still fits (typically Q4)
4. `code`: code-specialized model
5. Keep `.ai/ENVVARS.md` defaults aligned with this file
