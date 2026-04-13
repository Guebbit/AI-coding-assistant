/**
 * Shared path-safety helpers.
 *
 * Several tools (fs.read, fs.write, image.classify, semantic.search,
 * speech.to.text, pdf.read, project.scaffold) need to resolve user-supplied
 * paths while ensuring they stay inside a trusted root directory.
 *
 * Centralising this logic satisfies the Single Responsibility Principle
 * and removes the copy-pasted `resolveSafePath` / `resolveInsideRoot`
 * functions that previously lived in each tool file.
 *
 * @module shared/path-safety
 */

import path from 'path';

/**
 * Resolve `userPath` relative to the current working directory and
 * verify that the result does not escape the project root.
 *
 * Throws an `Error` if the resolved path is outside the project root
 * (e.g. via `../` traversal).
 *
 * @param userPath - Relative or absolute path supplied by the caller.
 * @returns The fully resolved, root-safe absolute path.
 * @throws {Error} When the path escapes the project root.
 */
export function resolveSafePath(userPath: string): string {
    const resolved = path.resolve(process.cwd(), userPath);
    const root = path.resolve(process.cwd());
    if (!resolved.startsWith(root + path.sep) && resolved !== root) {
        throw new Error('Access denied: path is outside the project root');
    }
    return resolved;
}

/**
 * Resolve `userPath` relative to an arbitrary `root` directory and
 * verify that the result does not escape that root.
 *
 * This variant is used by tools that operate within a specific
 * sub-directory (e.g. `PROJECT_OUTPUT_ROOT` or `BOILERPLATE_ROOT`).
 *
 * @param root     - The trusted root directory (must be an absolute path).
 * @param userPath - Relative path supplied by the caller.
 * @returns The fully resolved, root-safe absolute path.
 * @throws {Error} When the path escapes the allowed root.
 */
export function resolveInsideRoot(root: string, userPath: string): string {
    const resolved = path.resolve(root, userPath);
    if (!resolved.startsWith(root + path.sep) && resolved !== root) {
        throw new Error('Access denied: path is outside the allowed root');
    }
    return resolved;
}
