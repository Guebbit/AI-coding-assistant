/**
 * Project scaffolding tool — copy a boilerplate template into the
 * workspace root output directory.
 *
 * Reads templates from `BOILERPLATE_ROOT` and writes them to
 * `AGENT_WORKSPACE_ROOT`. Optionally reads a metadata JSON file
 * from the template directory for downstream consumers.
 *
 * Uses the shared `resolveInsideRoot` helper for path safety.
 *
 * @module tools/project.scaffold
 */

import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { assertWritePathAllowed, getWorkspaceRoot, resolveInsideRoot } from '../shared';
import { createTool } from './tool-builder';

/** Root directory where boilerplate templates are stored. */
const BOILERPLATE_ROOT = path.resolve(
    process.cwd(),
    process.env.BOILERPLATE_ROOT ?? 'data/boilerplates'
);

/**
 * Check whether a file or directory exists at the given path.
 *
 * @param targetPath - Absolute path to check.
 * @returns `true` if the path exists, `false` otherwise.
 */
async function exists(targetPath: string): Promise<boolean> {
    try {
        await fs.access(targetPath);
        return true;
    } catch {
        return false;
    }
}

/**
 * Tool instance for scaffolding new projects from boilerplate templates.
 *
 * Input:
 * ```json
 * {
 *   "template":     "express-ts",
 *   "projectName":  "my-app",
 *   "overwrite":    false,
 *   "metadataFile": "template.json"
 * }
 * ```
 */
export const scaffoldProjectTool = createTool({
    id: 'scaffold_project',
    description:
        'Scaffold a project by copying a boilerplate template into AGENT_WORKSPACE_ROOT. ' +
        'Input: { template: string, projectName: string, overwrite?: boolean, metadataFile?: string }',
    inputSchema: z.object({
        template: z.string().trim().min(1, '"template" must be a non-empty string'),
        projectName: z.string().trim().min(1, '"projectName" must be a non-empty string'),
        overwrite: z.boolean().optional(),
        metadataFile: z.string().optional()
    }),
    outputSchema: z.object({
        template: z.string(),
        projectPath: z.string(),
        outputRoot: z.string(),
        boilerplateRoot: z.string(),
        metadata: z.unknown().nullable()
    }),

    /**
     * Copy the boilerplate template directory to the output root.
     *
     * @param input              - Tool input object.
     * @param input.template     - Relative path under `BOILERPLATE_ROOT` identifying the template.
     * @param input.projectName  - Relative path under `AGENT_WORKSPACE_ROOT` for the new project.
     * @param input.overwrite    - When `true`, delete the target if it already exists (default: `false`).
     * @param input.metadataFile - Name of the JSON metadata file inside the template (default: `"template.json"`).
     * @returns Metadata about the scaffolded project (paths, template info).
     * @throws {Error} When inputs are invalid, template is missing, or target exists without overwrite.
     */
    async execute({ template, projectName, overwrite, metadataFile }) {
        const workspaceRoot = getWorkspaceRoot();
        const templatePath = resolveInsideRoot(BOILERPLATE_ROOT, template);
        const targetPath = resolveInsideRoot(workspaceRoot, projectName);
        await assertWritePathAllowed(targetPath);
        const allowOverwrite = overwrite === true;

        /* Validate metadata filename — must be a plain filename, no path separators. */
        const metadataFilename =
            typeof metadataFile === 'string' && metadataFile.trim() !== ''
                ? metadataFile.trim()
                : 'template.json';
        if (
            metadataFilename.includes('/') ||
            metadataFilename.includes('\\') ||
            path.basename(metadataFilename) !== metadataFilename ||
            metadataFilename === '..'
        ) {
            throw new Error('metadataFile must be a plain filename without path separators');
        }

        /* Verify the template directory exists. */
        const templateStat = await fs.stat(templatePath).catch(() => null);
        if (!templateStat || !templateStat.isDirectory()) {
            throw new Error(`Template directory not found: ${template}`);
        }

        /* Handle existing target. */
        const targetExists = await exists(targetPath);
        if (targetExists && !allowOverwrite) {
            throw new Error(
                `Target already exists: ${projectName}. Set "overwrite": true to replace it.`
            );
        }
        if (targetExists && allowOverwrite) {
            await fs.rm(targetPath, { recursive: true, force: true });
        }

        /* Copy the template into the output directory. */
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.cp(templatePath, targetPath, { recursive: true });

        /* Read optional metadata file from the template. */
        const metadataPath = resolveInsideRoot(templatePath, metadataFilename);
        let metadata: unknown = null;
        if (await exists(metadataPath)) {
            const raw = await fs.readFile(metadataPath, 'utf-8');
            try {
                metadata = JSON.parse(raw);
            } catch {
                metadata = raw;
            }
        }

        return {
            template: path.relative(BOILERPLATE_ROOT, templatePath),
            projectPath: path.relative(process.cwd(), targetPath),
            outputRoot: path.relative(process.cwd(), workspaceRoot),
            boilerplateRoot: path.relative(process.cwd(), BOILERPLATE_ROOT),
            metadata
        };
    }
});
