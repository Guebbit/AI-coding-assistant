# tools/speech_to_text

## What

Transcribes audio files with Ollama’s OpenAI-compatible transcription endpoint.

## Input

```json
{
  "path": "relative/path/to/audio.wav",
  "model": "optional",
  "language": "optional",
  "prompt": "optional"
}
```

## Defaults

- model: `TOOL_STT_MODEL` or `whisper`

## Notes

- Uses `POST /v1/audio/transcriptions` on the configured Ollama host.
- Path is restricted to project root boundaries.
