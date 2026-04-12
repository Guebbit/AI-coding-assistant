# tools/image_classify

## What

Runs image classification/description using a vision model.

## Input

```json
{ "path": "relative/path/to/image.png", "prompt": "optional", "model": "optional" }
```

## Defaults

- model: `TOOL_VISION_MODEL` or `llava-llama3`

## Notes

- Path is restricted to project root boundaries.
- The tool sends base64 image data to Ollama `/api/generate` with `images`.
