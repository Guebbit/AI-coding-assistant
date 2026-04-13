/**
 * Shell tool — execute allow-listed shell commands.
 *
 * Only commands whose base name appears in `ALLOWED_COMMANDS` are
 * permitted; any other command is rejected before execution.  A hard
 * timeout prevents runaway processes.
 *
 * @module tools/shell
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type { ITool } from './types';

const execAsync = promisify(exec);

/**
 * Set of base command names that the agent is allowed to run.
 *
 * Only the first whitespace-separated token of the command string is
 * checked, so arguments like `ls -la` are still allowed.
 * Extend this set deliberately when new commands are needed.
 */
const ALLOWED_COMMANDS = new Set([
    'cat',
    'date',
    'df',
    'du',
    'echo',
    'find',
    'git',
    'grep',
    'ls',
    'node',
    'npm',
    'ps',
    'pwd',
    'uname'
]);

/** Default execution timeout in milliseconds (10 seconds). */
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Tool instance for running shell commands.
 *
 * Input:
 * ```json
 * { "command": "ls -la", "timeout": 5000 }
 * ```
 */
export const shellTool: ITool = {
    name: 'shell',
    description:
        'Run a whitelisted shell command. ' +
        `Input: { command: string, timeout?: number (ms, default ${DEFAULT_TIMEOUT_MS}) }`,

    /**
     * Execute the given shell command and return its stdout/stderr.
     *
     * @param input         - Tool input object.
     * @param input.command - The full command string (e.g. `"ls -la"`).
     * @param input.timeout - Optional timeout in milliseconds (default: 10 000).
     * @returns `{ stdout, stderr }` with trimmed output.
     * @throws {Error} When the command base name is not in the allow-list.
     */
    async execute({ command, timeout }) {
        if (typeof command !== 'string' || command.trim() === '') {
            throw new Error('"command" must be a non-empty string');
        }

        /* Extract the base command name (first token) and validate. */
        const baseCommand = command.trim().split(/\s+/)[0];
        if (!ALLOWED_COMMANDS.has(baseCommand)) {
            throw new Error(
                `Command "${baseCommand}" is not allowed. ` +
                    `Allowed commands: ${[...ALLOWED_COMMANDS].sort().join(', ')}`
            );
        }

        const timeoutMs = typeof timeout === 'number' && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS;

        const { stdout, stderr } = await execAsync(command, {
            timeout: timeoutMs,
            shell: '/bin/bash'
        });

        return { stdout: stdout.trim(), stderr: stderr.trim() };
    }
};
