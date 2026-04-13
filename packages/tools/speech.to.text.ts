/**
 * Speech-to-text tool — transcribe audio files using Ollama's
 * OpenAI-compatible `/v1/audio/transcriptions` endpoint.
 *
 * Accepts an audio file from disk (`path`) **or** as inline base64
 * data (`data`).  Uses the shared `resolveSafePath` helper to prevent
 * directory traversal when reading from disk.
 *
 * When both `path` and `data` are provided, `data` takes precedence.
 *
 * @module tools/speech.to.text
 */

import fs from 'fs/promises';
import path from 'path';
import type { ITool } from './types';
import { resolveSafePath } from '../shared';

/** Ollama base URL for the transcription endpoint. */
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';

/** Default speech-to-text model. */
const DEFAULT_STT_MODEL = process.env.TOOL_STT_MODEL ?? 'whisper';

/**
 * Tool instance for transcribing audio files.
 *
 * Input (disk):
 * ```json
 * { "path": "audio/meeting.wav", "model": "whisper", "language": "en", "prompt": "context" }
 * ```
 *
 * Input (inline base64):
 * ```json
 * { "data": "<base64>", "filename": "meeting.wav", "model": "whisper", "language": "en" }
 * ```
 */
export const speechToTextTool: ITool = {
    name: 'speech_to_text',
    description:
        'Transcribe an audio file using Ollama OpenAI-compatible transcription endpoint. ' +
        'Input: { path?: string, data?: string (base64), filename?: string, model?: string, language?: string, prompt?: string }. ' +
        'Provide either path (file on disk) or data (base64-encoded audio).',

    /**
     * Read the audio file (from disk or inline base64) and send it to Ollama for transcription.
     *
     * @param input          - Tool input object.
     * @param input.path     - Path to the audio file (relative to project root). Required unless `data` is provided.
     * @param input.data     - Base64-encoded audio content. Takes precedence over `path`.
     * @param input.filename - Original filename hint (used when `data` is provided; defaults to `"audio.wav"`).
     * @param input.model    - Optional override for the STT model name.
     * @param input.language - Optional language hint (ISO 639-1 code, e.g. `"en"`).
     * @param input.prompt   - Optional context/prompt to guide transcription.
     * @returns `{ model, path, text }` where `text` is the transcribed content.
     * @throws {Error} When neither `path` nor `data` is provided, or the API fails.
     */
    async execute({ path: audioPath, data, filename, model, language, prompt }) {
        let audioData: Buffer;
        let resolvedFilename: string;

        if (typeof data === 'string' && data.trim() !== '') {
            audioData = Buffer.from(data, 'base64');
            resolvedFilename =
                typeof filename === 'string' && filename.trim() ? filename : 'audio.wav';
        } else if (typeof audioPath === 'string' && audioPath.trim() !== '') {
            const safePath = resolveSafePath(audioPath);
            audioData = await fs.readFile(safePath);
            resolvedFilename = path.basename(safePath);
        } else {
            throw new Error(
                'Either "path" (file on disk) or "data" (base64 string) must be provided'
            );
        }

        if (audioData.length === 0) {
            throw new Error('Audio data is empty');
        }

        const usedModel = typeof model === 'string' && model.trim() ? model : DEFAULT_STT_MODEL;

        /* Build multipart form data for the transcription API. */
        const form = new FormData();
        form.append('model', usedModel);
        if (typeof language === 'string' && language.trim()) {
            form.append('language', language);
        }
        if (typeof prompt === 'string' && prompt.trim()) {
            form.append('prompt', prompt);
        }
        form.append('file', new Blob([new Uint8Array(audioData)]), resolvedFilename);

        const res = await fetch(`${OLLAMA_BASE_URL}/v1/audio/transcriptions`, {
            method: 'POST',
            body: form
        });

        if (!res.ok) {
            const body = await res.text().catch(() => '');
            throw new Error(
                `Ollama transcription error: ${res.status} ${res.statusText}${body ? ` — ${body}` : ''}`
            );
        }

        const parsed = (await res.json()) as { text?: string };
        return {
            model: usedModel,
            path: typeof audioPath === 'string' ? audioPath : undefined,
            text: parsed.text ?? ''
        };
    }
};
