/**
 * NER-based entity and relationship extractor for the knowledge graph.
 *
 * Sends a text chunk to an Ollama LLM (the model is configurable via
 * `GRAPH_NER_MODEL`, defaulting to the fast agent model) and requests a
 * structured JSON response listing entities and directed relationships.
 *
 * The function is **fail-open**: if Ollama is unreachable, returns a
 * syntactically invalid JSON response, or produces entities/relationships
 * that fail validation, it logs a warning and returns an empty extraction
 * result rather than throwing.
 *
 * **Configuration** (all optional):
 * - `GRAPH_NER_MODEL`  (default: value of `AGENT_MODEL_FAST`, then `"llama3.1:8b-instruct-q8_0"`)
 * - `OLLAMA_BASE_URL`  (default `http://localhost:11434`)
 *
 * @module graph/extractor
 */

import { z } from 'zod';
import { getLogger } from '../logger/logger';
import { OLLAMA_BASE_URL } from '../llm/config';
import type { IExtractionResult } from './types';

const log = getLogger('graph:extractor');

/* ── Configuration ──────────────────────────────────────────────────── */

/**
 * The model used for entity/relationship extraction.
 *
 * Defaults to `AGENT_MODEL_FAST` so the user doesn't have to pull an
 * extra model; override with `GRAPH_NER_MODEL` for a dedicated model.
 */
const NER_MODEL =
    process.env.GRAPH_NER_MODEL ?? process.env.AGENT_MODEL_FAST ?? 'llama3.1:8b-instruct-q8_0';

/* ── Zod schemas for the LLM response ──────────────────────────────── */

/** Valid entity type values, used to coerce/validate LLM output. */
const entityTypeValues = [
    'Person',
    'Organization',
    'Concept',
    'Technology',
    'Location',
    'Document',
    'Topic',
    'Other'
] as const;

/**
 * Zod schema for a single entity returned by the LLM.
 *
 * The `.catch()` fallbacks ensure that slightly malformed LLM responses
 * are coerced gracefully rather than rejected outright.
 */
const entitySchema = z.object({
    name: z.string().min(1),
    type: z
        .string()
        .transform((t) => {
            /* Accept case-insensitive input from the LLM. */
            const normalised = t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
            const known = entityTypeValues.find(
                (v) => v.toLowerCase() === normalised.toLowerCase()
            );
            return known ?? 'Other';
        })
        .pipe(z.enum(entityTypeValues)),
    description: z.string().optional()
});

/**
 * Zod schema for a single relationship returned by the LLM.
 */
const relationshipSchema = z.object({
    from: z.string().min(1),
    to: z.string().min(1),
    type: z.string().min(1),
    context: z.string().optional()
});

/**
 * Zod schema for the full LLM JSON response.
 */
const extractionResponseSchema = z.object({
    entities: z.array(entitySchema),
    relationships: z.array(relationshipSchema)
});

/* ── Extraction prompt ──────────────────────────────────────────────── */

/**
 * Build the extraction prompt for a given text chunk.
 *
 * The prompt asks the model to return strict JSON with two top-level
 * arrays: `entities` and `relationships`.
 *
 * @param text - The text chunk to analyse.
 * @returns The formatted prompt string.
 */
function buildExtractionPrompt(text: string): string {
    return (
        'You are a named-entity recognition (NER) assistant. ' +
        'Analyse the text below and respond with a single JSON object (no markdown, no prose) ' +
        'containing exactly two keys:\n\n' +
        '  "entities":      array of { name, type, description? }\n' +
        '  "relationships": array of { from, to, type, context? }\n\n' +
        'Entity types: Person, Organization, Concept, Technology, Location, Document, Topic, Other\n' +
        'Relationship types: any short snake_case or lowercase string (e.g. "uses", "part_of", "authored_by").\n\n' +
        '--- TEXT ---\n' +
        text +
        '\n--- END TEXT ---\n\n' +
        'Respond with ONLY the JSON object. No explanation.'
    );
}

/* ── Code-fence stripper ─────────────────────────────────────────────── */

/**
 * Strip Markdown code fences (` ```json ... ``` ` or ` ``` ... ``` `) from
 * an LLM response so we can parse the inner JSON reliably.
 *
 * @param raw - Raw LLM response string.
 * @returns The response with fences removed.
 */
function stripCodeFences(raw: string): string {
    return raw
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim();
}

/* ── Public API ─────────────────────────────────────────────────────── */

/**
 * Extract entities and relationships from a text chunk using Ollama.
 *
 * Returns an empty `{ entities: [], relationships: [] }` result if:
 * - Ollama is unreachable.
 * - The model returns malformed or non-JSON output.
 * - Schema validation fails.
 *
 * @param text - The text to analyse (typically a single document chunk).
 * @returns A structured extraction result (never throws).
 */
export async function extractEntitiesAndRelationships(text: string): Promise<IExtractionResult> {
    const empty: IExtractionResult = { entities: [], relationships: [] };

    if (!text.trim()) {
        return empty;
    }

    try {
        const res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: NER_MODEL,
                prompt: buildExtractionPrompt(text),
                stream: false,
                format: 'json'
            })
        });

        if (!res.ok) {
            log.warn('graph_ner_request_failed', {
                status: res.status,
                statusText: res.statusText
            });
            return empty;
        }

        const raw = (await res.json()) as { response?: string };
        if (!raw.response) {
            return empty;
        }

        const cleaned = stripCodeFences(raw.response);
        const parsed: unknown = JSON.parse(cleaned);
        const validated = extractionResponseSchema.safeParse(parsed);

        if (!validated.success) {
            log.warn('graph_ner_schema_invalid', {
                issues: validated.error.issues.slice(0, 3)
            });
            return empty;
        }

        return validated.data;
    } catch (error) {
        log.warn('graph_ner_extraction_failed', { error: String(error) });
        return empty;
    }
}
