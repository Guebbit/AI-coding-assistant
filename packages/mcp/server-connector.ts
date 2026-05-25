/**
 * MCP server connector — transport creation + tool wrapping.
 *
 * ROLE: Connects to a single MCP server, discovers its tools,
 * and wraps each one as a native Manna `ITool` object.
 *
 * @module mcp/server-connector
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { logger } from '../logger/logger';
import type { ITool } from '../tools/types';
import { checkMCPServerHealth } from './health';
import type { IMCPServerConfig, IMCPToolMeta } from './types';
import { interpolateEnvironmentMap } from './config-parser';

/* ── Configuration ───────────────────────────────────────────────────── */

/** Default connection timeout for MCP server connect/list calls. */
const DEFAULT_MCP_CONNECT_TIMEOUT_MS = 5000;

/* ── Timeout helper ──────────────────────────────────────────────────── */

/**
 * Run a promise with a timeout boundary.
 *
 * @throws {Error} Throws when the operation exceeds `timeoutMs`.
 */
function withTimeout<T>(operation: Promise<T>, timeoutMs: number, message: string): Promise<T> {
    return Promise.race([
        operation,
        new Promise<T>((_, reject) => {
            setTimeout(() => reject(new Error(message)), timeoutMs);
        })
    ]);
}

/* ── Transport creation ──────────────────────────────────────────────── */

/**
 * Create the transport instance for one server config.
 *
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

/* ── Tool name helper ────────────────────────────────────────────────── */

/**
 * Build the namespaced Manna tool name for an MCP tool.
 */
function getMannaToolName(serverName: string, toolName: string): string {
    return `mcp_${serverName}__${toolName}`;
}

/* ── Result extraction ───────────────────────────────────────────────── */

/**
 * Extract user-facing text from an MCP `callTool` result.
 */
function extractTextFromCallToolResult(result: Awaited<ReturnType<Client['callTool']>>): string {
    if ('content' in result && Array.isArray(result.content)) {
        const textBlocks = result.content
            .filter((item): item is { type: 'text'; text: string } => item.type === 'text')
            .map((item) => item.text.trim())
            .filter((item) => item.length > 0);

        if (textBlocks.length > 0) return textBlocks.join('\n');
        return JSON.stringify(result.content);
    }

    if ('toolResult' in result) {
        return typeof result.toolResult === 'string'
            ? result.toolResult
            : JSON.stringify(result.toolResult);
    }

    return JSON.stringify(result);
}

/* ── Public API ──────────────────────────────────────────────────────── */

/** Result of connecting to a single MCP server. */
export interface IServerConnectResult {
    readTools: ITool[];
    writeTools: ITool[];
    meta: IMCPToolMeta[];
}

/**
 * Connect to a single MCP server, discover its tools, and wrap them.
 *
 * @param server    - Server configuration.
 * @param timeoutMs - Connection/call timeout override.
 * @returns Discovered tools and metadata, or null on failure.
 */
export async function connectAndDiscoverTools(
    server: IMCPServerConfig,
    timeoutMs?: number
): Promise<IServerConnectResult | null> {
    const effectiveTimeout = timeoutMs ?? DEFAULT_MCP_CONNECT_TIMEOUT_MS;
    const isWrite = server.writeTools === true;

    const transport = createTransport(server);
    const client = new Client({ name: 'manna-mcp-bridge', version: '1.0.0' }, { capabilities: {} });

    // Connect with timeout
    await withTimeout(
        client.connect(transport),
        effectiveTimeout,
        `MCP server "${server.name}" connect timeout (${effectiveTimeout}ms)`
    );

    // Health check
    const healthy = await withTimeout(
        checkMCPServerHealth(client),
        effectiveTimeout,
        `MCP server "${server.name}" health timeout (${effectiveTimeout}ms)`
    );
    if (!healthy) {
        logger.warn('mcp_server_unhealthy', { component: 'mcp', server: server.name });
        await client.close().catch(() => undefined);
        return null;
    }

    // Discover tools
    const listedTools = await withTimeout(
        client.listTools(),
        effectiveTimeout,
        `MCP server "${server.name}" tools/list timeout (${effectiveTimeout}ms)`
    );

    const readTools: ITool[] = [];
    const writeTools: ITool[] = [];
    const meta: IMCPToolMeta[] = [];

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
                    effectiveTimeout,
                    `MCP tool "${server.name}/${originalName}" call timeout (${effectiveTimeout}ms)`
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

    return { readTools, writeTools, meta };
}
