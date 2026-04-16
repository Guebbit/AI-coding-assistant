/**
 * Unit tests for MCP tool loader.
 *
 * @module tests/unit/mcp/loader.test
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const connectMock = vi.fn(async () => undefined);
const listToolsMock = vi.fn(async () => ({ tools: [] }));
const callToolMock = vi.fn(async () => ({ content: [{ type: 'text', text: 'ok' }] }));
const closeMock = vi.fn(async () => undefined);
const stdioCtorMock = vi.fn();
const sseCtorMock = vi.fn();

vi.mock('../../../packages/logger/logger.js', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn()
    }
}));

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
    Client: class MockClient {
        public connect = connectMock;
        public listTools = listToolsMock;
        public callTool = callToolMock;
        public close = closeMock;
    }
}));

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
    StdioClientTransport: class MockStdioClientTransport {
        constructor(serverParameters: unknown) {
            stdioCtorMock(serverParameters);
        }
    }
}));

vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => ({
    SSEClientTransport: class MockSSEClientTransport {
        constructor(url: URL) {
            sseCtorMock(url);
        }
    }
}));

describe('loadMCPTools', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        delete process.env.MCP_ENABLED;
        delete process.env.MCP_CONFIG_PATH;
        delete process.env.MCP_CONNECT_TIMEOUT_MS;
        delete process.env.TEST_MCP_TOKEN;
    });

    afterEach(async () => {
        vi.restoreAllMocks();
    });

    it('returns empty arrays when MCP is disabled', async () => {
        process.env.MCP_ENABLED = 'false';
        const { loadMCPTools } = await import('../../../packages/mcp/loader.js');
        const result = await loadMCPTools('/does/not/matter.json');
        expect(result).toEqual({ readTools: [], writeTools: [], meta: [] });
    });

    it('returns empty arrays when config file does not exist', async () => {
        const { loadMCPTools } = await import('../../../packages/mcp/loader.js');
        const result = await loadMCPTools('/tmp/manna-missing-mcp-config.json');
        expect(result).toEqual({ readTools: [], writeTools: [], meta: [] });
    });

    it('discovers MCP tools, namespaces names, and interpolates stdio env vars', async () => {
        const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'manna-mcp-test-'));
        const configPath = path.join(temporaryDirectory, 'mcp-servers.json');
        process.env.TEST_MCP_TOKEN = 'token-123';

        await writeFile(
            configPath,
            JSON.stringify({
                servers: [
                    {
                        name: 'github',
                        transport: 'stdio',
                        command: 'npx',
                        args: ['-y', '@modelcontextprotocol/server-github'],
                        env: {
                            GITHUB_PERSONAL_ACCESS_TOKEN: '${TEST_MCP_TOKEN}'
                        }
                    }
                ]
            }),
            'utf8'
        );

        listToolsMock.mockResolvedValue({
            tools: [
                {
                    name: 'create_issue',
                    description: 'Create a GitHub issue',
                    inputSchema: { type: 'object' }
                }
            ]
        });

        const { loadMCPTools } = await import('../../../packages/mcp/loader.js');
        const result = await loadMCPTools(configPath);

        expect(result.readTools).toHaveLength(1);
        expect(result.writeTools).toHaveLength(0);
        expect(result.meta).toEqual([
            {
                serverName: 'github',
                originalName: 'create_issue',
                mannaName: 'mcp_github__create_issue',
                description: 'Create a GitHub issue',
                isWrite: false
            }
        ]);
        expect(result.readTools[0]?.name).toBe('mcp_github__create_issue');
        expect(result.readTools[0]?.description).toBe('[MCP:github] Create a GitHub issue');

        const toolResult = await result.readTools[0]!.execute({ title: 'Hello' });
        expect(toolResult).toBe('ok');
        expect(callToolMock).toHaveBeenCalledWith({
            name: 'create_issue',
            arguments: { title: 'Hello' }
        });

        expect(stdioCtorMock).toHaveBeenCalledWith(
            expect.objectContaining({
                command: 'npx',
                env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'token-123' }
            })
        );

        await rm(temporaryDirectory, { recursive: true, force: true });
    });

    it('skips failed servers and keeps loading others (fail-open)', async () => {
        const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'manna-mcp-test-'));
        const configPath = path.join(temporaryDirectory, 'mcp-servers.json');
        await writeFile(
            configPath,
            JSON.stringify({
                servers: [
                    {
                        name: 'broken',
                        transport: 'sse',
                        url: 'https://example.com/sse',
                        writeTools: true
                    },
                    {
                        name: 'ok',
                        transport: 'stdio',
                        command: 'npx',
                        args: ['-y', 'ok-server'],
                        writeTools: true
                    }
                ]
            }),
            'utf8'
        );

        connectMock.mockRejectedValueOnce(new Error('connect failed'));
        listToolsMock.mockResolvedValue({
            tools: [{ name: 'save', description: 'Persist data', inputSchema: { type: 'object' } }]
        });

        const { loadMCPTools } = await import('../../../packages/mcp/loader.js');
        const result = await loadMCPTools(configPath);

        expect(result.readTools).toHaveLength(0);
        expect(result.writeTools).toHaveLength(1);
        expect(result.writeTools[0]?.name).toBe('mcp_ok__save');

        await rm(temporaryDirectory, { recursive: true, force: true });
    });
});
