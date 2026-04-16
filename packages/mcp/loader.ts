/**
 * MCP startup loader — discovers MCP tools and wraps them as native `ITool`.
 *
 * @module mcp/loader
 */

import { access, readFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { z } from 'zod';
import { logger } from '../logger/logger';
import { envInt } from '../shared/env';
import type { ITool } from '../tools/types';
import { checkMCPServerHealth } from './health';
import type { IMCPConfig, IMCPServerConfig, IMCPToolMeta } from './types';

/** Default file path for MCP server configuration. */
const DEFAULT_MCP_CONFIG_PATH = 'data/mcp-servers.json';

/** Default connection timeout for MCP server connect/list calls. */
const DEFAULT_MCP_CONNECT_TIMEOUT_MS = 5000;

/** Regex used to resolve `${VAR_NAME}` placeholders in MCP env entries. */
const ENV_INTERPOLATION_PATTERN = /\${(\w+)}/g;

/** Zod schema for stdio MCP servers. */
const stdioServerSchema = z.object({
    name: z.string().min(1),
    transport: z.literal('stdio'),
    command: z.string().min(1),
    args: z.array(z.string()).optional(),
    env: z.record(z.string()).optional(),
    timeoutMs: z.number().int().positive().optional(),
    writeTools: z.boolean().optional()
});

/** Zod schema for SSE MCP servers. */
const sseServerSchema = z.object({
    name: z.string().min(1),
    transport: z.literal('sse'),
    url: z.string().url(),
    timeoutMs: z.number().int().positive().optional(),
    writeTools: z.boolean().optional()
});

/** Zod schema for full MCP config file. */
const mcpConfigSchema = z.object({
    servers: z.array(z.union([stdioServerSchema, sseServerSchema]))
});

/**
 * Run a promise with a timeout boundary.
 *
 * @template T - Promise resolution type.
 * @param operation - Async operation to execute.
 * @param timeoutMs - Timeout in milliseconds.
 * @param message - Error message for timeout rejection.
 * @returns The resolved value from `operation` if completed in time.
 * @throws {Error} Throws when the operation exceeds `timeoutMs`.
 */
async function withTimeout<T>(
    operation: Promise<T>,
    timeoutMs: number,
    message: string
): Promise<T> {
    return Promise.race([
        operation,
        new Promise<T>((_, reject) => {
            setTimeout(() => reject(new Error(message)), timeoutMs);
        })
    ]);
}

/**
 * Interpolate `${VAR}` placeholders against `process.env`.
 *
 * Missing environment variables resolve to an empty string.
 *
 * @param value - Raw string that may contain `${VAR}` placeholders.
 * @returns Interpolated string value.
 */
function interpolateEnvironmentValue(value: string): string {
    return value.replaceAll(ENV_INTERPOLATION_PATTERN, (_match, variableName: string) => {
        const resolvedValue = process.env[variableName];
        if (resolvedValue === undefined) {
            logger.warn('mcp_env_var_missing', { component: 'mcp', variableName });
            return '';
        }
        return resolvedValue;
    });
}

/**
 * Interpolate all env values in an env object.
 *
 * @param env - Optional environment map from config.
 * @returns Interpolated environment map or `undefined` when no env was provided.
 */
function interpolateEnvironmentMap(
    env: Record<string, string> | undefined
): Record<string, string> | undefined {
    if (!env) {
        return undefined;
    }

    return Object.fromEntries(
        Object.entries(env).map(([key, value]) => [key, interpolateEnvironmentValue(value)])
    );
}

/**
 * Build the namespaced Manna tool name for an MCP tool.
 *
 * @param serverName - MCP server name from config.
 * @param toolName - Original tool name from MCP.
 * @returns Namespaced tool name (`mcp_<server>__<tool>`).
 */
function getMannaToolName(serverName: string, toolName: string): string {
    return `mcp_${serverName}__${toolName}`;
}

/**
 * Extract user-facing text from an MCP `callTool` result.
 *
 * @param result - Result returned by `client.callTool`.
 * @returns Best-effort text representation.
 */
function extractTextFromCallToolResult(result: Awaited<ReturnType<Client['callTool']>>): string {
    if ('content' in result && Array.isArray(result.content)) {
        const textBlocks = result.content
            .filter((item): item is { type: 'text'; text: string } => {
                return item.type === 'text';
            })
            .map((item) => item.text.trim())
            .filter((item) => item.length > 0);

        if (textBlocks.length > 0) {
            return textBlocks.join('\n');
        }

        return JSON.stringify(result.content);
    }

    if ('toolResult' in result) {
        if (typeof result.toolResult === 'string') {
            return result.toolResult;
        }
        return JSON.stringify(result.toolResult);
    }

    return JSON.stringify(result);
}

/**
 * Create the transport instance for one server config.
 *
 * @param server - MCP server configuration.
 * @returns MCP transport instance.
 * @throws {Error} Throws when required transport fields are missing.
 */
function createTransport(server: IMCPServerConfig): SSEClientTransport | StdioClientTransport {
    if (server.transport === 'stdio') {
        if (!server.command) {
            throw new Error(`MCP stdio server "${server.name}" is missing "command"`);
        }
        return new StdioClientTransport({
            command: server.command,
            args: server.args,
            env: interpolateEnvironmentMap(server.env),
            stderr: 'ignore'
        });
    }

    if (!server.url) {
        throw new Error(`MCP SSE server "${server.name}" is missing "url"`);
    }
    return new SSEClientTransport(new URL(server.url));
}

/**
 * Parse and validate MCP configuration from disk.
 *
 * @param absoluteConfigPath - Absolute config file path.
 * @returns Parsed MCP config or `null` when invalid.
 */
async function parseMCPConfig(absoluteConfigPath: string): Promise<IMCPConfig | null> {
    const fileContents = await readFile(absoluteConfigPath, 'utf8');
    const parsedJson: unknown = JSON.parse(fileContents);
    const parsedConfig = mcpConfigSchema.safeParse(parsedJson);
    if (!parsedConfig.success) {
        logger.warn('mcp_config_invalid', {
            component: 'mcp',
            path: absoluteConfigPath,
            errors: parsedConfig.error.issues.map((issue) => issue.message)
        });
        return null;
    }
    return parsedConfig.data;
}

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
 * @throws {Error} Never intentionally throws; all operational failures are handled and logged.
 */
export async function loadMCPTools(configPath?: string): Promise<{
    readTools: ITool[];
    writeTools: ITool[];
    meta: IMCPToolMeta[];
}> {
    const mcpEnabled = process.env.MCP_ENABLED ?? 'true';
    if (mcpEnabled === 'false') {
        logger.info('mcp_loading_disabled', { component: 'mcp' });
        return { readTools: [], writeTools: [], meta: [] };
    }

    const configuredPath = configPath ?? process.env.MCP_CONFIG_PATH ?? DEFAULT_MCP_CONFIG_PATH;
    const absoluteConfigPath = path.isAbsolute(configuredPath)
        ? configuredPath
        : path.resolve(process.cwd(), configuredPath);

    try {
        await access(absoluteConfigPath, fsConstants.F_OK);
    } catch {
        logger.info('mcp_config_not_found', { component: 'mcp', path: absoluteConfigPath });
        return { readTools: [], writeTools: [], meta: [] };
    }

    let config: IMCPConfig | null = null;
    try {
        config = await parseMCPConfig(absoluteConfigPath);
    } catch (error) {
        logger.warn('mcp_config_parse_failed', {
            component: 'mcp',
            path: absoluteConfigPath,
            error: String(error)
        });
        return { readTools: [], writeTools: [], meta: [] };
    }

    if (!config) {
        return { readTools: [], writeTools: [], meta: [] };
    }

    const readTools: ITool[] = [];
    const writeTools: ITool[] = [];
    const meta: IMCPToolMeta[] = [];

    for (const server of config.servers) {
        const timeoutMs =
            server.timeoutMs ??
            envInt(process.env.MCP_CONNECT_TIMEOUT_MS, DEFAULT_MCP_CONNECT_TIMEOUT_MS);
        const isWrite = server.writeTools === true;

        try {
            const transport = createTransport(server);
            const client = new Client(
                { name: 'manna-mcp-bridge', version: '1.0.0' },
                { capabilities: {} }
            );

            await withTimeout(
                client.connect(transport),
                timeoutMs,
                `MCP server "${server.name}" connect timeout (${timeoutMs}ms)`
            );

            const healthy = await withTimeout(
                checkMCPServerHealth(client),
                timeoutMs,
                `MCP server "${server.name}" health timeout (${timeoutMs}ms)`
            );
            if (!healthy) {
                logger.warn('mcp_server_unhealthy', { component: 'mcp', server: server.name });
                await client.close().catch(() => undefined);
                continue;
            }

            const listedTools = await withTimeout(
                client.listTools(),
                timeoutMs,
                `MCP server "${server.name}" tools/list timeout (${timeoutMs}ms)`
            );

            for (const discoveredTool of listedTools.tools) {
                const originalName = discoveredTool.name;
                const description = discoveredTool.description ?? 'No description provided.';
                const mannaName = getMannaToolName(server.name, originalName);

                const wrappedTool: ITool = {
                    name: mannaName,
                    description: `[MCP:${server.name}] ${description}`,
                    async execute(input: Record<string, unknown>): Promise<string> {
                        const callResult = await withTimeout(
                            client.callTool({ name: originalName, arguments: input }),
                            timeoutMs,
                            `MCP tool "${server.name}/${originalName}" call timeout (${timeoutMs}ms)`
                        );
                        return extractTextFromCallToolResult(callResult);
                    }
                };

                if (isWrite) {
                    writeTools.push(wrappedTool);
                } else {
                    readTools.push(wrappedTool);
                }

                meta.push({
                    serverName: server.name,
                    originalName,
                    mannaName,
                    description,
                    isWrite
                });
            }

            logger.info('mcp_server_connected', {
                component: 'mcp',
                server: server.name,
                discoveredTools: listedTools.tools.length,
                writeTools: isWrite
            });
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
