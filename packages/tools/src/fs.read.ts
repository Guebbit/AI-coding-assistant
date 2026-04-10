import fs from "fs/promises";
import path from "path";
import type { Tool } from "./types";

/**
 * Read a file from disk and return its UTF-8 contents.
 *
 * The path is resolved relative to the current working directory.
 * Directory traversal outside the project root is blocked.
 */
export const readFileTool: Tool = {
  name: "read_file",
  description: "Read a file from disk. Input: { path: string }",

  async execute({ path: filePath }) {
    if (typeof filePath !== "string" || filePath.trim() === "") {
      throw new Error('"path" must be a non-empty string');
    }

    const resolved = path.resolve(process.cwd(), filePath);

    // Block traversal outside the project root
    const root = path.resolve(process.cwd());
    if (!resolved.startsWith(root + path.sep) && resolved !== root) {
      throw new Error("Access denied: path is outside the project root");
    }

    return await fs.readFile(resolved, "utf-8");
  },
};
