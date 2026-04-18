/**
 * MCP server health checks.
 *
 * @module mcp/health
 */

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { envNumber } from '../shared';

/** Default per-server MCP connect/check timeout in milliseconds. */
const DEFAULT_MCP_CONNECT_TIMEOUT_MS = 5000;

/**
 * Check whether an MCP server is healthy by attempting `listTools()`.
 *
 * The call is bounded by `MCP_CONNECT_TIMEOUT_MS` (or 5000 ms default).
 *
 * @param client - Connected MCP client instance to check.
 * @returns `true` when the check succeeds within timeout, otherwise `false`.
 * @throws Never throws. All failures are converted to `false`.
 */
export async function checkMCPServerHealth(client: Client): Promise<boolean> {
    const timeoutMs = envNumber(process.env.MCP_CONNECT_TIMEOUT_MS, DEFAULT_MCP_CONNECT_TIMEOUT_MS);

    try {
        await Promise.race([
            client.listTools(),
            new Promise((_, reject) => {
                setTimeout(
                    () => reject(new Error(`MCP health check timed out after ${timeoutMs}ms`)),
                    timeoutMs
                );
            })
        ]);
        return true;
    } catch {
        return false;
    }
}
