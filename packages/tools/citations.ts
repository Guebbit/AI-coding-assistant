/**
 * Tool citation types and buffer.
 *
 * ROLE: Tools that return source references (e.g. semantic search, library search)
 * attach `citations` arrays to their results. This module defines the shared
 * schema, type, and the mutable `ToolCitationBuffer` that accumulates citations
 * across multiple tool calls in one agent run before flushing them into the
 * final `IAgentRunResult`.
 *
 * @module tools/citations
 */

import { z } from 'zod';

/**
 * Zod schema for a single tool citation.
 * All three fields are required and must be non-empty strings.
 */
export const toolCitationSchema = z.object({
    /** Stable identifier for the source document or record. */
    id: z.string().min(1),
    /** Human-readable title of the cited source. */
    title: z.string().min(1),
    /** Relevant excerpt or summary from the source. */
    text: z.string().min(1)
});

/**
 * A single citation returned by a tool — links an agent answer back to a source.
 */
export type IToolCitation = z.infer<typeof toolCitationSchema>;

/**
 * Mutable buffer that accumulates citations across multiple tool calls
 * in one agent run.  Flushed once into `IAgentRunResult.citations` at run end.
 */
export class ToolCitationBuffer {
    /** Internal citation store, appended to by `add` / `addMany`. */
    private readonly citations: IToolCitation[] = [];

    /**
     * Add a single citation to the buffer.
     * @param citation - Validated citation to store.
     */
    add(citation: IToolCitation): void {
        this.citations.push(citation);
    }

    /**
     * Add multiple citations at once.
     * @param citations - Array of validated citations to append.
     */
    addMany(citations: IToolCitation[]): void {
        for (const citation of citations) {
            this.add(citation);
        }
    }

    /**
     * Return all buffered citations and clear the buffer.
     * Call this once at the end of a run to harvest citations.
     */
    flush(): IToolCitation[] {
        const output = [...this.citations];
        this.citations.length = 0;
        return output;
    }

    /**
     * Return a copy of all buffered citations without clearing the buffer.
     * Useful for inspecting citations mid-run without consuming them.
     */
    peek(): IToolCitation[] {
        return [...this.citations];
    }
}
