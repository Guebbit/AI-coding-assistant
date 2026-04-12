import fs from "fs/promises";
import path from "path";
import type { Tool } from "./types";

const PROJECT_OUTPUT_ROOT = path.resolve(
  process.cwd(),
  process.env.PROJECT_OUTPUT_ROOT ?? "data/generated-projects"
);

type WriteMode = "create" | "overwrite" | "append";

function resolveInsideRoot(root: string, userPath: string): string {
  const resolved = path.resolve(root, userPath);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error("Access denied: path is outside the allowed output root");
  }
  return resolved;
}

/**
 * Write a UTF-8 file under the configured project output root.
 *
 * Input:
 * {
 *   path: string,                 // relative path under PROJECT_OUTPUT_ROOT
 *   content: string,
 *   mode?: "create" | "overwrite" | "append" // default: "create"
 * }
 */
export const writeFileTool: Tool = {
  name: "write_file",
  description:
    "Write UTF-8 file content under the generated-projects root only. " +
    'Input: { path: string, content: string, mode?: "create" | "overwrite" | "append" }',

  async execute({ path: filePath, content, mode }) {
    if (typeof filePath !== "string" || filePath.trim() === "") {
      throw new Error('"path" must be a non-empty string');
    }
    if (typeof content !== "string") {
      throw new Error('"content" must be a string');
    }

    const writeMode: WriteMode =
      mode === "overwrite" || mode === "append" || mode === "create"
        ? mode
        : "create";

    const resolvedPath = resolveInsideRoot(PROJECT_OUTPUT_ROOT, filePath);
    const parentDir = path.dirname(resolvedPath);
    await fs.mkdir(parentDir, { recursive: true });

    if (writeMode === "append") {
      await fs.appendFile(resolvedPath, content, "utf-8");
    } else if (writeMode === "overwrite") {
      await fs.writeFile(resolvedPath, content, "utf-8");
    } else {
      try {
        await fs.writeFile(resolvedPath, content, { encoding: "utf-8", flag: "wx" });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
          throw new Error(
            `File already exists at "${filePath}". Use mode "overwrite" to replace it.`
          );
        }
        throw error;
      }
    }

    return {
      path: path.relative(process.cwd(), resolvedPath),
      mode: writeMode,
      bytesWritten: Buffer.byteLength(content, "utf-8"),
      outputRoot: path.relative(process.cwd(), PROJECT_OUTPUT_ROOT),
    };
  },
};
