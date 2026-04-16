# Scenario 5.2 -- Speech transcription

::: tip TL;DR
Send an audio file to Whisper, verify it returns a transcript.
:::

**Goal**: verify speech_to_text sends audio to Whisper and returns a transcript.

> Requires Whisper model installed and `TOOL_STT_MODEL=whisper` set.
> Place any audio file at `data/examples/meeting.wav` first.

**Prompt:**

```
Transcribe audio file data/examples/meeting.wav
```

**Expected tool**: `speech_to_text`

**Level up**: test analysis on top of transcription:

```
Transcribe data/examples/meeting.wav and list any action items mentioned.
```

(Two-step: transcribe -> agent analyses transcript for tasks)

---

← [Back to Scenarios](index.md)
