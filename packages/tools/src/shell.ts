import { exec } from "child_process";
import { promisify } from "util";
import type { Tool } from "./types";

const execAsync = promisify(exec);

/**
 * Allowed base commands.
 * Only the first token of the command string is checked, so you can still
 * pass arguments (e.g. `ls -la`).  Extend this list deliberately.
 */
const ALLOWED_COMMANDS = new Set([
  "cat",
  "date",
  "df",
  "du",
  "echo",
  "find",
  "git",
  "grep",
  "ls",
  "node",
  "npm",
  "ps",
  "pwd",
  "uname",
]);

const DEFAULT_TIMEOUT_MS = 10_000; // 10 seconds

/**
 * Execute a shell command and return stdout / stderr.
 *
 * Safety measures:
 *  1. Command base-name must be on the allowlist.
 *  2. Hard timeout (default 10 s, configurable per call).
 */
export const shellTool: Tool = {
  name: "shell",
  description:
    "Run a whitelisted shell command. " +
    `Input: { command: string, timeout?: number (ms, default ${DEFAULT_TIMEOUT_MS}) }`,

  async execute({ command, timeout }) {
    if (typeof command !== "string" || command.trim() === "") {
      throw new Error('"command" must be a non-empty string');
    }

    const baseCommand = command.trim().split(/\s+/)[0];
    if (!ALLOWED_COMMANDS.has(baseCommand)) {
      throw new Error(
        `Command "${baseCommand}" is not allowed. ` +
          `Allowed commands: ${[...ALLOWED_COMMANDS].sort().join(", ")}`
      );
    }

    const timeoutMs =
      typeof timeout === "number" && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS;

    const { stdout, stderr } = await execAsync(command, {
      timeout: timeoutMs,
      shell: "/bin/bash",
    });

    return { stdout: stdout.trim(), stderr: stderr.trim() };
  },
};
