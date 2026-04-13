# Tool: `speech_to_text`

::: tip TL;DR
Transcribes audio files using Whisper. Accepts file path or base64 upload.
:::

## What it does in plain English

> "Listen to this audio file and write down everything that was said."

Sends an audio file to a speech transcription model (Whisper) and returns the transcribed text. Works for meeting recordings, voice notes, interview recordings, etc.

## Input

The tool accepts either a file path (disk) or inline base64 data (e.g. from an API upload). When both are provided, `data` takes precedence.

**From disk:**
```json
{
  "path": "relative/path/to/audio.wav",
  "model": "optional",
  "language": "optional",
  "prompt": "optional"
}
```

**From upload (base64):**
```json
{
  "data": "<base64-encoded audio>",
  "filename": "meeting.wav",
  "model": "optional",
  "language": "optional",
  "prompt": "optional"
}
```

| Field | Required | Default | Notes |
|---|---|---|---|
| `path` | one of `path` / `data` | — | Path to audio file, relative to project root |
| `data` | one of `path` / `data` | — | Base64-encoded audio content (takes precedence over `path`) |
| `filename` | ❌ | `"audio.wav"` | Original filename hint (used when `data` is provided) |
| `model` | ❌ | `TOOL_STT_MODEL` or `whisper` | Override the transcription model |
| `language` | ❌ | auto-detect | ISO language code e.g. `"en"`, `"it"`, `"fr"` |
| `prompt` | ❌ | — | Optional context hint to improve accuracy (e.g. "technical discussion about TypeScript") |

## Output

The transcribed text as a plain string:

```
"Good morning team. Today we are going to review the sprint results and plan the next iteration..."
```

## Defaults

- Model: reads `TOOL_STT_MODEL` env var, falls back to `whisper`
- Language auto-detected from audio content if not specified

## How it works internally

```text
Audio from disk OR base64 data from upload  (.wav / .mp3 / .m4a)
    |
Tool reads file bytes (or uses provided base64 directly)
    |
POST /v1/audio/transcriptions  ->  Ollama (OpenAI-compatible endpoint)
  multipart/form-data: file + model + language + prompt
    |
Whisper model transcribes the audio
    |
Tool returns transcribed text to agent
```

There is also a dedicated upload endpoint: `POST /upload/speech-to-text` (accepts `multipart/form-data`).

## Real-life use cases

### Use case 1 -- Transcribe a meeting recording

You recorded your daily standup and want searchable notes.

**Prompt:**
```
Transcribe data/recordings/standup-2024-01-15.wav and summarise the 3 main discussion points.
```

**What happens:**
1. Tool sends audio to Whisper
2. Returns full transcript
3. Agent summarises into bullet points

---

### Use case 2 -- Turn a voice note into a task list

You recorded yourself thinking out loud about what to build next.

**Prompt:**
```
Transcribe data/voice-notes/ideas.wav and extract all the action items mentioned.
```

---

### Use case 3 -- Transcribe with language hint (better accuracy)

**Prompt:**
```
Transcribe data/recordings/italian-meeting.wav in Italian.
```

Agent uses `language: "it"` for better accuracy on non-English audio.

---

### Use case 4 -- Multi-step: transcribe then analyse

**Prompt:**
```
Transcribe data/examples/meeting.wav and tell me if any decisions were made.
```

**Steps:**
```
Step 1: speech_to_text  ->  { "path": "data/examples/meeting.wav" }
Step 2: action: "none"  ->  Agent analyses the transcript and highlights decisions
```

---

## Good test prompts

| What you type | What the agent does |
|---|---|
| `Transcribe data/examples/meeting.wav` | Returns full transcript |
| `Transcribe audio file data/voice-notes/todo.wav and list all tasks mentioned.` | Transcribes + extracts tasks |
| `How long is the speech in data/recordings/intro.wav?` | Transcribes, agent estimates duration from word count |

## Notes

- Uses `POST /v1/audio/transcriptions` on the configured Ollama host.
- Path is restricted to project root boundaries.
