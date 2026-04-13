# Tool: `image_classify`

::: tip TL;DR
Sends an image to a vision model (llava) and gets back a text description.
:::

## What it does in plain English

> "Look at this image and tell me what you see."

Sends an image to a **vision model** (multimodal LLM) via Ollama and gets back a description or classification.

## Input

The tool accepts either a file path (disk) or inline base64 data (e.g. from an API upload). When both are provided, `data` takes precedence.

**From disk:**
```json
{
  "path": "relative/path/to/image.png",
  "prompt": "optional question or instruction",
  "model": "optional model override"
}
```

**From upload (base64):**
```json
{
  "data": "<base64-encoded image>",
  "prompt": "optional question or instruction",
  "model": "optional model override"
}
```

| Field | Required | Default | Notes |
|---|---|---|---|
| `path` | one of `path` / `data` | — | Path to image file, relative to project root |
| `data` | one of `path` / `data` | — | Base64-encoded image content (takes precedence over `path`) |
| `prompt` | ❌ | `"Describe this image."` | What to ask the vision model |
| `model` | ❌ | `TOOL_VISION_MODEL` or `llava-llama3` | Override the vision model for this call |

## Output

A plain-text description or answer from the vision model.

```
"The image shows a great white shark swimming near the surface of the ocean.
The shark's distinctive dorsal fin is clearly visible above the waterline."
```

## Defaults

- Model: reads `TOOL_VISION_MODEL` env var, falls back to `llava-llama3`
- Path is resolved against the project root — traversal outside that boundary is rejected

## Model and runtime option env vars

| Variable | Default | Description |
|---|---|---|
| `TOOL_VISION_MODEL` | `llava-llama3` | Vision model used for classification |
| `TOOL_VISION_TEMPERATURE` | `0.2` | Sampling temperature — lower = more precise |
| `TOOL_VISION_TOP_P` | `0.8` | Nucleus sampling probability |
| `TOOL_VISION_TOP_K` | `20` | Top-K token candidates |
| `TOOL_VISION_NUM_CTX` | `4096` | Context window size (tokens) |
| `TOOL_VISION_REPEAT_PENALTY` | `1.3` | Repetition penalty |

These defaults are tuned for factual precision — the vision model is asked to describe what it actually sees, not to be creative.

## How the tool works internally

```text
Image from disk OR base64 data from upload
    ↓
Tool encodes file bytes as Base64 (or uses provided base64 directly)
    ↓
POST /api/generate  →  Ollama
  { model: "llava-llama3", prompt: "...", images: ["<base64>"] }
    ↓
Ollama passes image to vision model
    ↓
Model returns text description
    ↓
Tool returns description to agent
```

There is also a dedicated upload endpoint: `POST /upload/image-classify` (accepts `multipart/form-data`).

## Real-life use cases

### Use case 1 — Describe a screenshot for documentation

You have a UI screenshot and want to auto-generate alt text or a doc description.

**Prompt:**
```
Classify the image at data/screenshots/dashboard.png and describe what UI elements are visible.
```

**What happens:**
1. Tool reads `data/screenshots/dashboard.png`
2. Encodes it as Base64
3. Sends to `llava-llama3` via Ollama
4. Returns: `"A web dashboard showing a sidebar navigation, a bar chart in the center, and a table of recent orders below."`

---

### Use case 2 — Detect a bug from a screenshot

**Prompt:**
```
Look at data/bugs/error-screenshot.png and describe what error is shown.
```

Agent reads the error message text visible in the screenshot and explains it.

---

### Use case 3 — Check a diagram

**Prompt:**
```
Describe the architecture diagram at docs/images/architecture.png.
```

---

### Use case 4 — Custom question about an image

**Prompt:**
```
Classify the image at data/examples/shark.jpg and tell me what species it might be.
```

The agent uses a custom `prompt` field: `"What species does this animal appear to be?"`

---

## Good test prompts

| What you type | What the agent does |
|---|---|
| `Classify data/examples/shark.jpg` | Describes the image content |
| `What does the image at data/screenshots/home.png show?` | Returns UI/content description |
| `Is there any text visible in data/images/sign.jpg?` | Vision model reads text in image (OCR-like) |
| `Describe the chart in data/exports/revenue-chart.png` | Describes chart type, axes, data shape |
