/**
 * LLM caller — encapsulates both "native tool calling" and "untooled fallback"
 * strategies for invoking the LLM during an agent step.
 *
 * WHY: The agent loop had two large if/else branches for calling the LLM.
 * Extracting them here keeps `agent.ts` focused on orchestration (SRP).
 *
 * TWO STRATEGIES:
 *  1. Native tool calling — model supports `tools` param (like OpenAI function calling).
 *     We send tools as structured schemas; model returns tool_calls in response.
 *  2. Untooled fallback — model only does text generation.
 *     We embed tool schemas in the prompt and parse JSON from the response.
 *
 * @module agent/llm-caller
 */

import {
    generateWithMetadata,
    chatWithMetadata,
    modelSupportsNativeToolCalling
} from '../llm/ollama';
import type { IGenerateResult, IChatResult } from '../llm/ollama';
import type { ITool } from '../tools/types';
import { logger } from '../logger/logger';
import { emit } from '../events/bus';
import { stripCodeFences } from '../shared';
import { agentStepSchema } from './schemas';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { RunContext, ITokenAccumulator } from './run-context';

/** The parsed output of one LLM call — what the agent decided to do. */
export interface IParsedToolCall {
    thought: string;
    action: string;
    input: Record<string, unknown>;
}

/** Result of an LLM call (parsed decision + raw text + timing). */
export interface ILlmCallResult {
    parsed: IParsedToolCall;
    rawResponseText: string;
    llmDurationMs: number | undefined;
}

/* ── Token accumulation helper ───────────────────────────────────────────── */

/**
 * Accumulate token counts from an LLM result into a mutable accumulator.
 */
export function accumulateTokens(
    accumulator: ITokenAccumulator,
    llmResult: Pick<IGenerateResult | IChatResult, 'promptEvalCount' | 'evalCount'>
): void {
    if (typeof llmResult.promptEvalCount === 'number') {
        accumulator.promptTokens = (accumulator.promptTokens ?? 0) + llmResult.promptEvalCount;
    }
    if (typeof llmResult.evalCount === 'number') {
        accumulator.completionTokens = (accumulator.completionTokens ?? 0) + llmResult.evalCount;
    }
}

/**
 * Log and emit an LLM error, then re-throw.
 */
export function handleLlmError(error: unknown, step: number, runId?: string): never {
    logger.error('agent_llm_call_failed', {
        component: 'agent',
        step,
        error: String(error)
    });
    emit({ type: 'agent:error', payload: { runId, step, error: String(error) } });
    throw error;
}

/* ── Schema helpers for untooled validation ──────────────────────────────── */

function getToolInputSchema(tool: ITool): {
    required: string[];
    properties: Set<string> | null;
} {
    if (!tool.inputSchema) return { required: [], properties: null };
    const schema = zodToJsonSchema(tool.inputSchema) as {
        required?: string[];
        properties?: Record<string, unknown>;
    };
    const properties = schema.properties ? new Set(Object.keys(schema.properties)) : null;
    return { required: schema.required ?? [], properties };
}

/**
 * Validate a raw JSON object as a valid untooled tool call.
 * Returns null if the object doesn't match any known tool's schema.
 */
export function validateUntooledCall(
    tools: ITool[],
    candidate: { name?: unknown; arguments?: unknown }
): IParsedToolCall | null {
    if (typeof candidate.name !== 'string') return null;
    const tool = tools.find((entry) => entry.name === candidate.name);
    if (!tool) return null;
    if (typeof candidate.arguments !== 'object' || candidate.arguments === null) return null;
    if (Array.isArray(candidate.arguments)) return null;

    const input = candidate.arguments as Record<string, unknown>;
    const { required, properties } = getToolInputSchema(tool);

    for (const requiredKey of required) {
        if (!(requiredKey in input)) return null;
    }
    if (properties) {
        for (const key of Object.keys(input)) {
            if (!properties.has(key)) return null;
        }
    }
    return { thought: `Using tool ${tool.name}`, action: tool.name, input };
}

/* ── Prompt builder for untooled models ──────────────────────────────────── */

/**
 * Build the full prompt for models that don't support native tool calling.
 * Embeds tool schemas inline so the model can respond with JSON tool calls.
 */
export function buildUntooledPrompt(
    task: string,
    context: string,
    memory: string[],
    tools: ITool[]
): string {
    const memoryBlock = memory.length > 0 ? `Recent memory:\n${memory.join('\n')}\n\n` : '';
    const contextBlock = context ? `Context so far:\n${context}\n\n` : '';
    const toolBlocks = tools
        .map((tool) => {
            const schema = tool.inputSchema ? zodToJsonSchema(tool.inputSchema) : { type: 'object' };
            return (
                `Tool: ${tool.name}\n` +
                `Description: ${tool.description}\n` +
                `Input schema (JSON Schema): ${JSON.stringify(schema)}\n` +
                `Example:\n` +
                `{"name":"${tool.name}","arguments":{}}\n`
            );
        })
        .join('\n---\n');

    return (
        `You are an AI agent with access to tools.\n\n` +
        `Task:\n${task}\n\n` +
        memoryBlock +
        contextBlock +
        `When a tool is needed, respond ONLY in JSON with this exact format:\n` +
        `{"name":"tool_name","arguments":{}}\n` +
        `When no tool is needed and the task is complete, respond with plain text only.\n` +
        `Never include keys other than "name" and "arguments" for tool calls.\n` +
        `Never invent tool names or argument fields.\n\n` +
        `Available tools:\n${toolBlocks}\n`
    );
}

/* ── Native tool calling strategy ────────────────────────────────────────── */

/**
 * Call the LLM using the native tool-calling protocol (structured tool schemas).
 * The model returns tool_calls in the response when it wants to use a tool.
 */
export async function callWithNativeTools(
    ctx: RunContext,
    task: string,
    memory: string[],
    availableTools: ITool[],
    route: { model: string; options?: Record<string, unknown> },
    step: number
): Promise<ILlmCallResult> {
    const llmCallStartedAt = Date.now();

    // System + user prompt for the model
    const systemPrompt =
        'You are an AI agent. Use tools when needed. ' +
        'If no tools are needed, provide the final answer directly.';
    const userPrompt =
        `Task:\n${task}\n\n` +
        `${memory.length > 0 ? `Recent memory:\n${memory.join('\n')}\n\n` : ''}` +
        `${ctx.context ? `Context so far:\n${ctx.context}\n\n` : ''}`;

    // Convert tools to the native format
    const nativeTools = availableTools.map((tool) => ({
        type: 'function' as const,
        function: {
            name: tool.name,
            description: tool.description,
            parameters: (tool.inputSchema
                ? (zodToJsonSchema(tool.inputSchema) as Record<string, unknown>)
                : { type: 'object', properties: {} }) as Record<string, unknown>
        }
    }));

    const chatResult = await chatWithMetadata(
        [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ],
        { model: route.model, options: route.options, tools: nativeTools }
    ).catch((error: unknown) => handleLlmError(error, step, ctx.runId));

    const llmDurationMs = Date.now() - llmCallStartedAt;

    // Track tokens + model
    ctx.llmSteps += 1;
    ctx.modelsUsed.add(chatResult.model ?? route.model);
    accumulateTokens(ctx.tokens, chatResult);

    const rawResponseText = chatResult.message.content ?? '';
    const toolCall = chatResult.message.tool_calls?.[0];

    let parsed: IParsedToolCall;
    if (toolCall?.function?.name) {
        // Model wants to call a tool — parse its arguments
        const parsedArguments = (() => {
            if (typeof toolCall.function.arguments !== 'string') {
                return toolCall.function.arguments ?? {};
            }
            try {
                return JSON.parse(toolCall.function.arguments) as unknown;
            } catch {
                return {};
            }
        })();
        parsed = {
            thought: rawResponseText || `Using tool ${toolCall.function.name}`,
            action: toolCall.function.name,
            input:
                typeof parsedArguments === 'object' && parsedArguments
                    ? (parsedArguments as Record<string, unknown>)
                    : {}
        };
    } else {
        // No tool call → model gave a direct answer
        parsed = {
            thought: rawResponseText.trim() || 'Task completed.',
            action: 'none',
            input: {}
        };
    }

    return { parsed, rawResponseText, llmDurationMs };
}

/* ── Untooled fallback strategy ──────────────────────────────────────────── */

/**
 * Call the LLM using plain text generation (no native tool support).
 * Parses the response as JSON to extract tool calls.
 *
 * Returns null when JSON parsing fails (caller should append error to context).
 */
export async function callWithoutNativeTools(
    ctx: RunContext,
    task: string,
    memory: string[],
    availableTools: ITool[],
    route: { model: string; options?: Record<string, unknown> },
    step: number,
    inputContext: string
): Promise<ILlmCallResult | null> {
    const prompt = buildUntooledPrompt(task, ctx.context, memory, availableTools);
    const llmCallStartedAt = Date.now();

    logger.info('agent_step_started', {
        component: 'agent',
        step,
        contextLength: inputContext.length,
        promptLength: prompt.length,
        promptPreview: prompt.length > 300 ? prompt.slice(0, 300) + '…' : prompt
    });

    const llmResult = await generateWithMetadata(prompt, {
        model: route.model,
        images: ctx.pendingImages.length > 0 ? ctx.pendingImages : undefined,
        options: route.options
    }).catch((error: unknown) => handleLlmError(error, step, ctx.runId));

    const llmDurationMs = Date.now() - llmCallStartedAt;
    ctx.pendingImages = [];

    // Track tokens + model
    ctx.llmSteps += 1;
    ctx.modelsUsed.add(llmResult.model ?? route.model);
    accumulateTokens(ctx.tokens, llmResult);

    const rawResponseText = llmResult.response;
    logger.info('agent_llm_response_received', {
        component: 'agent',
        step,
        responseLength: llmResult.response.length,
        durationMs: ctx.elapsedMs,
        routedProfile: route.model,
        model: llmResult.model
    });

    // Try to parse as JSON (tool call or agent step schema)
    const cleaned = stripCodeFences(rawResponseText).trim();
    try {
        const parsedJson = JSON.parse(cleaned) as unknown;
        const asAgentStep = agentStepSchema.safeParse(parsedJson);
        let parsed: IParsedToolCall;

        if (asAgentStep.success) {
            parsed = asAgentStep.data;
        } else if (parsedJson && typeof parsedJson === 'object') {
            const asUntooled = validateUntooledCall(
                availableTools,
                parsedJson as { name?: unknown; arguments?: unknown }
            );
            parsed = asUntooled ?? { thought: cleaned, action: 'none', input: {} };
        } else {
            parsed = { thought: cleaned, action: 'none', input: {} };
        }

        return { parsed, rawResponseText, llmDurationMs };
    } catch {
        // JSON parsing failed — return null so caller can handle recovery
        return null;
    }
}

/**
 * Check if a model supports native tool calling.
 * (Re-exported for convenience so agent.ts doesn't import from llm directly.)
 */
export { modelSupportsNativeToolCalling };
