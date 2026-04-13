/**
 * Diagram generation tool — produces visual diagrams (flowcharts, sequence
 * diagrams, ER diagrams, mindmaps, etc.) from natural-language descriptions
 * or structured data.
 *
 * Two-stage pipeline:
 * 1. An Ollama LLM generates valid Mermaid markup from the description.
 * 2. `npx mmdc` (mermaid-cli) renders the markup to SVG or PNG.
 *
 * @module tools/diagram.generate
 */

import { z } from 'zod';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { generate } from '../llm/ollama';
import { createTool } from './tool-builder';

const execFileAsync = promisify(execFile);

/** Model used to generate Mermaid markup. Falls back through the standard chain. */
const DIAGRAM_MODEL =
    process.env.TOOL_DIAGRAM_MODEL ??
    process.env.AGENT_MODEL_CODE ??
    process.env.OLLAMA_MODEL ??
    'llama3';

/** Directory where rendered diagram files are written. */
const OUTPUT_DIR =
    process.env.DIAGRAM_OUTPUT_DIR ?? path.resolve(process.cwd(), 'data', 'diagrams');

/**
 * Tool that generates a visual diagram from a natural-language description
 * or structured data.
 *
 * Returns `{ mermaidSource, outputPath, format }`.
 */
export const generateDiagramTool = createTool({
    id: 'generate_diagram',
    description:
        'Generate a visual diagram (flowchart, sequence, ER, mindmap, etc.) ' +
        'from a description or structured data. Returns the file path to the ' +
        'rendered image and the Mermaid source. ' +
        "Input: { description: string, type?: string, format?: 'svg' | 'png' }",

    inputSchema: z.object({
        description: z
            .string()
            .min(1, 'description is required')
            .describe('What to visualise — can be natural language or raw data'),
        type: z
            .string()
            .optional()
            .describe(
                'Hint for diagram type: flowchart, sequence, classDiagram, erDiagram, ' +
                    'mindmap, gantt, pie, etc. If omitted the model picks the best fit.'
            ),
        format: z.enum(['svg', 'png']).optional().default('svg')
    }),

    async execute({ description, type, format }) {
        // 1. Ask the LLM to produce Mermaid markup
        const typeHint = type ? `Use a Mermaid "${type}" diagram.` : '';
        const prompt = [
            'You are a diagram-generation assistant.',
            'Return ONLY valid Mermaid diagram code, no explanation, no markdown fences.',
            typeHint,
            `Visualise the following:\n\n${description}`
        ]
            .filter(Boolean)
            .join('\n');

        const mermaidCode = (await generate(prompt, { model: DIAGRAM_MODEL })).trim();

        if (!mermaidCode) {
            throw new Error('LLM returned empty response; could not generate Mermaid markup');
        }

        // 2. Write the .mmd file
        await fs.mkdir(OUTPUT_DIR, { recursive: true });
        const timestamp = Date.now();
        const mmdPath = path.join(OUTPUT_DIR, `diagram-${timestamp}.mmd`);
        const outPath = path.join(OUTPUT_DIR, `diagram-${timestamp}.${format}`);

        await fs.writeFile(mmdPath, mermaidCode, 'utf-8');

        // 3. Render with mmdc (mermaid-cli)
        await execFileAsync('npx', ['mmdc', '-i', mmdPath, '-o', outPath, '-b', 'transparent']).catch(
            (error: unknown) => {
                throw new Error(
                    `mermaid-cli (mmdc) failed to render diagram. ` +
                        `Format: ${format}, source file: ${mmdPath}. ` +
                        `Underlying error: ${String(error)}`
                );
            }
        );

        return {
            mermaidSource: mermaidCode,
            outputPath: outPath,
            format
        };
    }
});
