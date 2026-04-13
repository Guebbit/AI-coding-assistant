/**
 * Project scaffolding tool — copy a boilerplate template into the
 * generated-projects output directory.
 *
 * Reads templates from `BOILERPLATE_ROOT` and writes them to
 * `PROJECT_OUTPUT_ROOT`.  Optionally reads a metadata JSON file
 * from the template directory for downstream consumers.
 *
 * Uses the shared `resolveInsideRoot` helper for path safety.
 *
 * @module tools/project.scaffold
 */

import fs from 'fs/promises';
import path from 'path';
import type { ITool } from './types';
import { resolveInsideRoot } from '../shared';

/** Root directory where boilerplate templates are stored. */
const BOILERPLATE_ROOT = path.resolve(
    process.cwd(),
    process.env.BOILERPLATE_ROOT ?? 'data/boilerplates'
);

/** Root directory where generated projects are written. */
const PROJECT_OUTPUT_ROOT = path.resolve(
    process.cwd(),
    process.env.PROJECT_OUTPUT_ROOT ?? 'data/generated-projects'
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
export const scaffoldProjectTool: ITool = {
    name: 'scaffold_project',
    description:
        'Scaffold a project by copying a boilerplate template into generated-projects root. ' +
        'Input: { template: string, projectName: string, overwrite?: boolean, metadataFile?: string }',

    /**
     * Copy the boilerplate template directory to the output root.
     *
     * @param input              - Tool input object.
     * @param input.template     - Relative path under `BOILERPLATE_ROOT` identifying the template.
     * @param input.projectName  - Relative path under `PROJECT_OUTPUT_ROOT` for the new project.
     * @param input.overwrite    - When `true`, delete the target if it already exists (default: `false`).
     * @param input.metadataFile - Name of the JSON metadata file inside the template (default: `"template.json"`).
     * @returns Metadata about the scaffolded project (paths, template info).
     * @throws {Error} When inputs are invalid, template is missing, or target exists without overwrite.
     */
    async execute({ template, projectName, overwrite, metadataFile }) {
        if (typeof template !== 'string' || template.trim() === '') {
            throw new Error('"template" must be a non-empty string');
        }
        if (typeof projectName !== 'string' || projectName.trim() === '') {
            throw new Error('"projectName" must be a non-empty string');
        }

        const templatePath = resolveInsideRoot(BOILERPLATE_ROOT, template);
        const targetPath = resolveInsideRoot(PROJECT_OUTPUT_ROOT, projectName);
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
            outputRoot: path.relative(process.cwd(), PROJECT_OUTPUT_ROOT),
            boilerplateRoot: path.relative(process.cwd(), BOILERPLATE_ROOT),
            metadata
        };
    }
};
