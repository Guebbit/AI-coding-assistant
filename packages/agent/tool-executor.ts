/**
 * Tool executor — handles tool dispatch, deduplication, error handling,
 * citation collection, and result-to-context conversion.
 *
 * WHY: The tool execution block in the agent loop was ~160 lines of
 * mixed concerns. This module isolates tool lifecycle (SRP).
 *
 * FLOW:
 *  1. Check deduplication → reject if same call was made recently.
 *  2. Execute the tool → success or failure.
 *  3. Notify processors of the result.
 *  4. Collect citations from tool output.
 *  5. Append tool result (or error feedback) to the run context.
 *
 * @module agent/tool-executor
 */

import type { ITool } from '../tools/types';
import type { IToolCall } from '../persistence/types';
import type { IDiagnosticEntry } from '../diagnostics';
import { logger } from '../logger/logger';
import { emit } from '../events/bus';
import { PathSafetyError } from '../shared/path-safety';
import { PolicyViolationError } from '../processors/policy';
import { toolCitationSchema, ToolCitationBuffer } from '../tools/citations';
import { ToolCallDeduplicator } from '../tools/tool-call-deduplicator';
import { isMultimodalModel } from './vision-capability';
import { getVisionDescription } from './vision-description';
import type { RunContext } from './run-context';
import type { IParsedToolCall } from './llm-caller';
import type { IProcessor, IProcessToolResultArgs } from '../processors/types';

/** Result of attempting to execute a tool. */
export interface IToolExecOutcome {
    /** Whether the tool ran successfully. */
    success: boolean;
    /** If tool has `directOutput: true` and succeeded, this is the final answer. */
    directAnswer?: string;
    /** Whether to break the inner tool-call loop. */
    shouldBreak: boolean;
}

/* ── Citation helper ─────────────────────────────────────────────────────── */

/**
 * Extract citations from a tool's result and add them to the buffer.
 */
export function collectCitationsFromToolResult(result: unknown, buffer: ToolCitationBuffer): void {
    if (!result || typeof result !== 'object') return;
    const maybeCitations = (result as { citations?: unknown }).citations;
    if (!Array.isArray(maybeCitations)) return;
    const parsed = maybeCitations
        .map((entry) => toolCitationSchema.safeParse(entry))
        .filter((entry) => entry.success)
        .map((entry) => entry.data);
    buffer.addMany(parsed);
}

/* ── Processor notification ──────────────────────────────────────────────── */

/**
 * Notify all processors of a tool result (fire-and-forget, errors logged).
 */
export async function runToolResultProcessors(
    processors: IProcessor[],
    args: IProcessToolResultArgs
): Promise<void> {
    for (const proc of processors) {
        if (proc.processToolResult) {
            await Promise.resolve(proc.processToolResult(args)).catch((error: unknown) => {
                logger.warn('agent_processor_tool_result_failed', {
                    component: 'agent',
                    error: String(error)
                });
            });
        }
    }
}

/* ── Deduplication check ─────────────────────────────────────────────────── */

/**
 * Check if a tool call is a duplicate and handle it.
 * Returns true if the call was rejected (duplicate).
 */
export async function handleDuplicateCheck(
    context: RunContext,
    parsed: IParsedToolCall,
    step: number,
    task: string,
    processors: IProcessor[]
): Promise<boolean> {
    if (!context.toolDeduplicator.isDuplicate(parsed.action, parsed.input)) return false;

    // Duplicate detected — append feedback and notify processors
    context.context +=
        `\nTool "${parsed.action}" with the same arguments was already called recently. ` +
        'Try a different tool or different arguments.';
    context.diagnosticEntries.push({
        timestamp: new Date().toISOString(),
        step,
        severity: 'warn',
        category: 'tool',
        code: 'E_DUPLICATE_CALL',
        message: `Duplicate tool call prevented for "${parsed.action}".`
    });
    await runToolResultProcessors(processors, {
        task,
        stepNumber: step,
        tool: parsed.action,
        input: parsed.input,
        success: false,
        error: 'Duplicate tool call',
        errorCode: 'E_DUPLICATE_CALL',
        durationMs: 0
    });
    return true;
}

/* ── Unknown tool check ──────────────────────────────────────────────────── */

/**
 * Handle the case when the agent requested a tool that doesn't exist.
 * Appends feedback to context and notifies processors.
 */
export async function handleUnknownTool(
    context: RunContext,
    parsed: IParsedToolCall,
    availableTools: ITool[],
    step: number,
    task: string,
    processors: IProcessor[]
): Promise<void> {
    const toolNames = availableTools.map((entry) => entry.name);
    logger.warn('agent_unknown_tool', {
        component: 'agent',
        step,
        action: parsed.action,
        availableTools: toolNames
    });
    context.context +=
        `\nTool "${parsed.action}" does not exist. ` + `Available tools: ${toolNames.join(', ')}.`;
    context.diagnosticEntries.push({
        timestamp: new Date().toISOString(),
        step,
        severity: 'warn',
        category: 'tool',
        code: 'E_TOOL_UNKNOWN',
        message: `Unknown tool requested: "${parsed.action}".`,
        metadata: { availableTools: toolNames }
    });
    await runToolResultProcessors(processors, {
        task,
        stepNumber: step,
        tool: parsed.action,
        input: parsed.input,
        success: false,
        error: `Unknown tool "${parsed.action}"`,
        errorCode: 'E_TOOL_UNKNOWN',
        durationMs: 0
    });
}

/* ── Main tool execution ─────────────────────────────────────────────────── */

/**
 * Execute a tool, handle success/failure, collect citations, update context.
 *
 * @returns Outcome describing what happened (success, direct answer, or failure).
 */
export async function executeTool(
    context: RunContext,
    tool: ITool,
    parsed: IParsedToolCall,
    step: number,
    task: string,
    processors: IProcessor[],
    routeModel: string
): Promise<IToolExecOutcome> {
    const toolStartedAt = Date.now();

    const toolResult = await tool
        .execute(parsed.input)
        .then(async (result) => {
            const durationMs = Date.now() - toolStartedAt;
            logger.info('agent_tool_executed', {
                component: 'agent',
                step,
                tool: parsed.action,
                durationMs
            });
            context.toolCalls.push({
                tool: parsed.action,
                step,
                input: parsed.input,
                result,
                success: true,
                durationMs
            });
            await runToolResultProcessors(processors, {
                task,
                stepNumber: step,
                tool: parsed.action,
                input: parsed.input,
                success: true,
                result,
                durationMs
            });
            return { success: true as const, result };
        })
        .catch(async (error: unknown) => {
            const durationMs = Date.now() - toolStartedAt;
            const errorCode =
                error instanceof PathSafetyError
                    ? error.code
                    : error instanceof PolicyViolationError
                      ? error.code
                      : undefined;

            // Actionable context feedback for path violations
            if (error instanceof PathSafetyError) {
                context.context +=
                    `\nTool "${parsed.action}" failed: Path \`${error.attemptedPath}\` ` +
                    `is outside the project root (\`${error.root}\`). ` +
                    `I cannot access files outside the project. ` +
                    `Please only request files within the project directory.`;
            } else {
                context.context += `\nTool "${parsed.action}" failed: ${String(error)}`;
            }

            logger.warn('agent_tool_failed', {
                component: 'agent',
                step,
                tool: parsed.action,
                errorCode,
                error: String(error)
            });
            emit({
                type: 'tool:error',
                payload: {
                    runId: context.runId,
                    step,
                    tool: parsed.action,
                    error: String(error),
                    errorCode,
                    durationMs
                }
            });
            context.diagnosticEntries.push({
                timestamp: new Date().toISOString(),
                step,
                severity: 'error',
                category: 'tool',
                code: errorCode,
                message: `Tool "${parsed.action}" failed: ${String(error)}`,
                metadata: { tool: parsed.action, errorCode }
            });
            context.toolCalls.push({
                tool: parsed.action,
                step,
                input: parsed.input,
                result: null,
                success: false,
                error: String(error),
                durationMs
            });
            await runToolResultProcessors(processors, {
                task,
                stepNumber: step,
                tool: parsed.action,
                input: parsed.input,
                success: false,
                error: String(error),
                errorCode,
                durationMs
            });
            return { success: false as const };
        });

    // Tool failed → break the inner loop
    if (!toolResult.success) return { success: false, shouldBreak: true };

    // Collect any citations the tool returned
    collectCitationsFromToolResult(toolResult.result, context.citationBuffer);
    emit({
        type: 'tool:result',
        payload: {
            runId: context.runId,
            step,
            tool: parsed.action,
            result: toolResult.result,
            durationMs: Date.now() - toolStartedAt
        }
    });

    // Direct-output tools short-circuit the loop entirely
    if (tool.directOutput) {
        const directAnswer =
            typeof toolResult.result === 'string'
                ? toolResult.result
                : JSON.stringify(toolResult.result);
        return { success: true, directAnswer, shouldBreak: true };
    }

    // Append tool result to context (handles images specially)
    await appendToolResultToContext(context, toolResult.result, parsed, step, routeModel);
    return { success: true, shouldBreak: false };
}

/* ── Context append helper ───────────────────────────────────────────────── */

/**
 * Append a tool's result to the run context.
 * If the result contains image data, attempts vision description first.
 */
async function appendToolResultToContext(
    context: RunContext,
    result: unknown,
    parsed: IParsedToolCall,
    step: number,
    model: string
): Promise<void> {
    const rawResult = result as Record<string, unknown> | null | undefined;
    const imageData =
        rawResult && typeof rawResult === 'object' && typeof rawResult.imageData === 'string'
            ? rawResult.imageData
            : undefined;

    if (imageData) {
        const description = await getVisionDescription(imageData);
        if (description) {
            context.context += `\nStep ${step} — image description: ${description}`;
        } else {
            const sanitized = { ...rawResult, imageData: '[base64 omitted]' };
            context.context += `\nStep ${step} — "${parsed.action}" returned: ${JSON.stringify(sanitized)}`;
        }
        if (isMultimodalModel(model)) {
            context.pendingImages.push(imageData);
        }
    } else {
        context.context += `\nStep ${step} — "${parsed.action}" returned: ${JSON.stringify(result)}`;
    }
}
