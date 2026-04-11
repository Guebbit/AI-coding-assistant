# Ollama Models — Quick Selection Guide

This file helps you choose a model quickly for local Ollama usage.

> Parameter count is not a direct quality score. Pick by task, VRAM, and response speed.

---

## 1) Quick recommendations

If you want one model to start with:

- **General assistant:** `llama3.1:8b` or `qwen3:4b`
- **Coding:** `deepseek-coder-v2:16b` or `qwen3-coder:14b`
- **Reasoning/math:** `deepseek-r1`
- **Very low VRAM / fast tests:** `phi3` / `phi4-mini` / `dolphin-phi`
- **Vision (image + text):** `llava-llama3`
- **Less filtered behavior (experimental):** `dolphin-llama3`, `llama2-uncensored`, `dolphin-phi`

---

## 2) Model catalog

### `llama3.1`
- **Variants:** 8B, 70B
- **Best for:** balanced day-to-day chat and assistant tasks
- **Notes:** strong default choice if you do not have a special need

### `mixtral`
- **Variants:** 8x7B (MoE), other MoE variants
- **Best for:** analysis, multilingual tasks, broader reasoning
- **Notes:** good quality/efficiency balance in many setups

### `qwen3`
- **Variants:** 4B and larger variants
- **Best for:** lightweight general assistant
- **Notes:** fast and practical for limited hardware

### `deepseek-r1`
- **Variants:** ~7B, 14B, 32B+
- **Best for:** logic-heavy prompts, math, structured reasoning
- **Notes:** useful when step-by-step reasoning quality matters

### `deepseek-coder-v2`
- **Variants:** 1.3B, 6.7B, 16B, 33B
- **Best for:** coding, refactors, debugging, repository work
- **Notes:** reliable coding specialist across many languages

### `qwen3-coder`
- **Variants:** 7B, 14B, 30B
- **Best for:** advanced coding and agent/tool workflows
- **Notes:** strong for planning + implementation prompts

### `phi3`
- **Variants:** Mini (~3.8B), Small, Medium
- **Best for:** lightweight assistant and basic coding
- **Notes:** good speed/quality ratio on smaller GPUs

### `phi4-mini`
- **Variants:** mini class (~3.8B family)
- **Best for:** fast responses, edge-like environments
- **Notes:** compact and efficient

### `dolphin-phi`
- **Variants:** ~2.7B class
- **Best for:** very small/faster uncensored experiments
- **Notes:** ultra-light, relaxed alignment

### `dolphin-llama3`
- **Variants:** 8B, 70B
- **Best for:** expressive chat, roleplay, creative generation
- **Notes:** uncensored fine-tune of Llama family

### `llama2-uncensored`
- **Variants:** 7B, 13B, 70B
- **Best for:** open-ended and less restricted testing
- **Notes:** primarily experimental usage

### `llava-llama3`
- **Variants:** 8B class
- **Best for:** image captioning, visual Q&A, multimodal tasks
- **Notes:** requires image+text workflow

---

## 3) Family overview

- **Llama family:** `llama3.1`, `dolphin-llama3`, `llama2-uncensored`
- **Phi family:** `phi3`, `phi4-mini`, `dolphin-phi`
- **Coding-focused:** `deepseek-coder-v2`, `qwen3-coder`
- **Reasoning-focused:** `deepseek-r1`
- **Multimodal:** `llava-llama3`

---

## 4) Practical selection rules

1. Start small (4B–8B) and confirm speed on your machine.
2. Move to larger variants only if quality is insufficient.
3. For coding, prefer coder-tuned models over general models.
4. For strict reasoning/math, test `deepseek-r1` first.
5. For privacy-sensitive docs, use local RAG with the model that fits your VRAM.

---

Reference libraries:
- https://ollama.com/library
- https://huggingface.co/
