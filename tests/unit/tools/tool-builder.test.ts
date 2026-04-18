/**
 * Unit tests for packages/tools/tool-builder.ts
 *
 * Tests createTool with and without Zod input schema validation,
 * verifying that schema validation errors surface as ZodError and
 * that valid inputs pass through to the execute function.
 */

import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { createTool } from '@/packages/tools/tool-builder.js';

describe('createTool', () => {
    it('creates a tool with the correct name and description', () => {
        const tool = createTool({
            id: 'my_tool',
            description: 'A simple test tool',
            execute: async () => 'result'
        });
        expect(tool.name).toBe('my_tool');
        expect(tool.description).toBe('A simple test tool');
    });

    it('executes successfully without an inputSchema', async () => {
        const tool = createTool({
            id: 'no_schema',
            description: 'No schema tool',
            execute: async (input) => `got:${JSON.stringify(input)}`
        });
        const result = await tool.execute({ key: 'value' });
        expect(result).toBe('got:{"key":"value"}');
    });

    it('validates input against inputSchema and passes typed input to execute', async () => {
        const execute = vi.fn(async ({ name }: { name: string }) => `Hello, ${name}!`);
        const tool = createTool({
            id: 'greet',
            description: 'Greet a person',
            inputSchema: z.object({ name: z.string().min(1) }),
            execute
        });
        const result = await tool.execute({ name: 'Alice' });
        expect(result).toBe('Hello, Alice!');
        expect(execute).toHaveBeenCalledWith({ name: 'Alice' });
    });

    it('throws ZodError when input violates the schema', async () => {
        const tool = createTool({
            id: 'strict_tool',
            description: 'Strict input',
            inputSchema: z.object({ count: z.number().positive() }),
            execute: async ({ count }) => count * 2
        });
        await expect(tool.execute({ count: -1 })).rejects.toThrow();
    });

    it('throws ZodError when a required field is missing', async () => {
        const tool = createTool({
            id: 'required_field',
            description: 'Required field test',
            inputSchema: z.object({ path: z.string() }),
            execute: async ({ path }) => path
        });
        await expect(tool.execute({})).rejects.toThrow();
    });

    it('throws ZodError when input has the wrong type', async () => {
        const tool = createTool({
            id: 'type_check',
            description: 'Type check',
            inputSchema: z.object({ limit: z.number() }),
            execute: async ({ limit }) => limit
        });
        await expect(tool.execute({ limit: 'not-a-number' })).rejects.toThrow();
    });

    it('exposes inputSchema and outputSchema when provided', () => {
        const input = z.object({ x: z.number() });
        const output = z.object({ result: z.number() });
        const tool = createTool({
            id: 'schema_exposed',
            description: 'Schema exposed',
            inputSchema: input,
            outputSchema: output,
            execute: async ({ x }) => ({ result: x * 2 })
        });
        expect(tool.inputSchema).toBe(input);
        expect(tool.outputSchema).toBe(output);
    });

    it('returns undefined for inputSchema and outputSchema when not provided', () => {
        const tool = createTool({
            id: 'no_schemas',
            description: 'No schemas',
            execute: async () => null
        });
        expect(tool.inputSchema).toBeUndefined();
        expect(tool.outputSchema).toBeUndefined();
    });

    it('exposes directOutput flag when provided', () => {
        const tool = createTool({
            id: 'direct',
            description: 'Direct output',
            directOutput: true,
            execute: async () => 'done'
        });
        expect(tool.directOutput).toBe(true);
    });

    it('passes through extra fields when schema uses .passthrough()', async () => {
        const tool = createTool({
            id: 'passthrough',
            description: 'Passthrough',
            inputSchema: z.object({ required: z.string() }).passthrough(),
            execute: async (input) => input
        });
        const result = await tool.execute({ required: 'yes', extra: 'field' });
        expect((result as Record<string, unknown>).required).toBe('yes');
    });
});
