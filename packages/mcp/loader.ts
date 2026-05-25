/**
 * MCP startup loader — orchestrates config parsing + server connection.
 *
 * ROLE: Top-level entry point that reads config, iterates servers, and
 * collects all discovered tools. Delegates heavy lifting to:
 *  - `config-parser.ts` — file I/O, schema validation, env interpolation
 *  - `server-connector.ts` — transport setup, health check, tool wrapping
 *
 * @module mcp/loader
 */

import { logger } from '../logger/logger';
import { envNumber } from '../shared';
import type { ITool } from '../tools/types';
import type { IMCPToolMeta } from './types';
import { resolveConfigPath, configFileExists, parseMCPConfig } from './config-parser';
import { connectAndDiscoverTools } from './server-connector';

/** Default connection timeout for MCP server connect/list calls. */
const DEFAULT_MCP_CONNECT_TIMEOUT_MS = 5000;

/**
 * Load MCP tools from configured servers, wrapping each discovered tool as native `ITool`.
 *
 * Behavior is fail-open:
 * - Missing config file: logs info and returns empty arrays.
 * - Disabled (`MCP_ENABLED=false`): returns empty arrays.
 * - Per-server failures: logs warning and skips only that server.
 *
 * @param configPath - Optional config path override.
 * @returns Discovered MCP read/write tools and metadata.
 */
export async function loadMCPTools(configPath?: string): Promise<{
    readTools: ITool[];
    writeTools: ITool[];
    meta: IMCPToolMeta[];
}> {
    // Feature flag check
    const mcpEnabled = process.env.MCP_ENABLED ?? 'true';
    if (mcpEnabled === 'false') {
        logger.info('mcp_loading_disabled', { component: 'mcp' });
        return { readTools: [], writeTools: [], meta: [] };
    }

    // Resolve and check config file
    const absoluteConfigPath = resolveConfigPath(configPath);

    const exists = await configFileExists(absoluteConfigPath);
    if (!exists) {
        logger.info('mcp_config_not_found', { component: 'mcp', path: absoluteConfigPath });
        return { readTools: [], writeTools: [], meta: [] };
    }

    // Parse config (fail-open)
    const config = await parseMCPConfig(absoluteConfigPath).catch((error: unknown) => {
        logger.warn('mcp_config_parse_failed', {
            component: 'mcp',
            path: absoluteConfigPath,
            error: String(error)
        });
        return null;
    });

    if (!config) {
        return { readTools: [], writeTools: [], meta: [] };
    }

    // Connect to each server and collect tools
    const readTools: ITool[] = [];
    const writeTools: ITool[] = [];
    const meta: IMCPToolMeta[] = [];

    for (const server of config.servers) {
        const timeoutMs =
            server.timeoutMs ??
            envNumber(process.env.MCP_CONNECT_TIMEOUT_MS, DEFAULT_MCP_CONNECT_TIMEOUT_MS);

        try {
            const result = await connectAndDiscoverTools(server, timeoutMs);
            if (result) {
                readTools.push(...result.readTools);
                writeTools.push(...result.writeTools);
                meta.push(...result.meta);
            }
        } catch (error) {
            logger.warn('mcp_server_failed', {
                component: 'mcp',
                server: server.name,
                error: String(error)
            });
        }
    }

    return { readTools, writeTools, meta };
}
