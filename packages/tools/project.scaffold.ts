import fs from "fs/promises";
import path from "path";
import type { Tool } from "./types";

const BOILERPLATE_ROOT = path.resolve(
  process.cwd(),
  process.env.BOILERPLATE_ROOT ?? "data/boilerplates"
);
const PROJECT_OUTPUT_ROOT = path.resolve(
  process.cwd(),
  process.env.PROJECT_OUTPUT_ROOT ?? "data/generated-projects"
);

function resolveInsideRoot(root: string, userPath: string): string {
  const resolved = path.resolve(root, userPath);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error("Access denied: path is outside allowed root");
  }
  return resolved;
}

async function exists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Copy a boilerplate directory into the generated-projects root.
 *
 * Input:
 * {
 *   template: string,      // relative path under BOILERPLATE_ROOT
 *   projectName: string,   // relative path under PROJECT_OUTPUT_ROOT
 *   overwrite?: boolean,   // default false
 *   metadataFile?: string  // default "template.json"
 * }
 */
export const scaffoldProjectTool: Tool = {
  name: "scaffold_project",
  description:
    "Scaffold a project by copying a boilerplate template into generated-projects root. " +
    "Input: { template: string, projectName: string, overwrite?: boolean, metadataFile?: string }",

  async execute({ template, projectName, overwrite, metadataFile }) {
    if (typeof template !== "string" || template.trim() === "") {
      throw new Error('"template" must be a non-empty string');
    }
    if (typeof projectName !== "string" || projectName.trim() === "") {
      throw new Error('"projectName" must be a non-empty string');
    }

    const templatePath = resolveInsideRoot(BOILERPLATE_ROOT, template);
    const targetPath = resolveInsideRoot(PROJECT_OUTPUT_ROOT, projectName);
    const allowOverwrite = overwrite === true;
    const metadataFilename =
      typeof metadataFile === "string" && metadataFile.trim() !== ""
        ? metadataFile.trim()
        : "template.json";
    if (
      metadataFilename.includes("/") ||
      metadataFilename.includes("\\") ||
      path.basename(metadataFilename) !== metadataFilename ||
      metadataFilename === ".."
    ) {
      throw new Error("metadataFile must be a plain filename without path separators");
    }

    const templateStat = await fs.stat(templatePath).catch(() => null);
    if (!templateStat || !templateStat.isDirectory()) {
      throw new Error(`Template directory not found: ${template}`);
    }

    const targetExists = await exists(targetPath);
    if (targetExists && !allowOverwrite) {
      throw new Error(
        `Target already exists: ${projectName}. Set "overwrite": true to replace it.`
      );
    }
    if (targetExists && allowOverwrite) {
      await fs.rm(targetPath, { recursive: true, force: true });
    }

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.cp(templatePath, targetPath, { recursive: true });

    const metadataPath = resolveInsideRoot(templatePath, metadataFilename);
    let metadata: unknown = null;
    if (await exists(metadataPath)) {
      const raw = await fs.readFile(metadataPath, "utf-8");
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
      metadata,
    };
  },
};
