/**
 * Core agent module — the reason → act → observe loop.
 *
 * ROLE: Orchestrates one "run" by composing focused sub-modules:
 *  - `run-context.ts`   — mutable run state (SRP: state management)
 *  - `llm-caller.ts`    — LLM invocation strategies (SRP: LLM communication)
 *  - `tool-executor.ts` — tool dispatch + result handling (SRP: tool lifecycle)
 *  - `run-finalizer.ts` — persistence + events + cleanup (SRP: run completion)
 *
 * This file only handles the high-level LOOP LOGIC:
 *  1. Load memory → 2. For each step: processors → LLM → tool → repeat → 3. Finalize.
 *
 * @module agent/agent
 */

import { generateWithMetadata } from '../llm/ollama';
import { getMemory } from '../memory/memory';
import { emit } from '../events/bus';
import type { ITool } from '../tools/types';
import { logger } from '../logger/logger';
import { resolveOperatingModeConfig } from '../shared';
import { routeModel } from './model-router';
import type { ModelProfile } from './model-router';
import type {
    IProcessor,
    IProcessInputStepArgs,
    IProcessOutputStepArgs
} from '../processors/types';
import { PolicyViolationError } from '../processors/policy';

// Sub-modules (SOLID decomposition)
import { RunContext } from './run-context';
import type { IAgentRunMeta, IAgentRunResult } from './run-context';
import {
    callWithNativeTools,
    callWithoutNativeTools,
    modelSupportsNativeToolCalling,
    handleLlmError,
    accumulateTokens
} from './llm-caller';
import type { IParsedToolCall } from './llm-caller';
import {
    executeTool,
    handleDuplicateCheck,
    handleUnknownTool,
    runToolResultProcessors
} from './tool-executor';
import {
    finalizeCompleted,
    finalizeDirectOutput,
    finalizeHardStop,
    finalizeMaxSteps
} from './run-finalizer';

// Re-export public types so consumers don't need to change imports
export type { IAgentRunMeta, IAgentRunResult } from './run-context';

/**
 * The core agent — wraps tools, processors, memory, and an LLM into a
 * single `run()` method that executes an agentic reasoning loop.
 *
 * Usage:
 * ```typescript
 * const agent = new Agent([readFileTool, shellTool]);
 * const run = await agent.run("List all TypeScript files in src/");
 * const answer = run.answer;
 * ```
 */
export class Agent {
    /** Registered processors (middleware hooks), invoked in order. */
    private readonly processors: IProcessor[] = [];

    /**
     * Create a new Agent.
     *
     * @param tools - The set of tools the agent is allowed to use.
     */
    constructor(private readonly tools: ITool[]) {}

    /**
     * Register a processor whose hooks will be called at each agent step.
     * Processors are invoked in registration order.
     *
     * @param processor - The processor to register.
     * @returns `this` for fluent chaining.
     */
    addProcessor(processor: IProcessor): this {
        this.processors.push(processor);
        return this;
    }

    /* ── Processor runners ───────────────────────────────────────────────── */

    /** Run all input processors in order (may inject context, filter tools). */
    private async runInputProcessors(args: IProcessInputStepArgs): Promise<IProcessInputStepArgs> {
        let result = args;
        for (const proc of this.processors) {
            if (proc.processInputStep) {
                const modified = await proc.processInputStep(result);
                if (modified) result = modified;
            }
        }
        return result;
    }

    /** Run all output processors in order (may rewrite action/thought). */
    private async runOutputProcessors(
        args: IProcessOutputStepArgs
    ): Promise<IProcessOutputStepArgs> {
        let result = args;
        for (const proc of this.processors) {
            if (proc.processOutputStep) {
                const modified = await proc.processOutputStep(result);
                if (modified) result = modified;
            }
        }
        return result;
    }

    /* ── Main loop ───────────────────────────────────────────────────────── */

    /**
     * Execute the full agentic loop for a given task.
     *
     * HIGH-LEVEL FLOW:
     *  1. Load memory relevant to the task.
     *  2. Loop up to maxSteps:
     *     a. Input processors (may hard-stop).
     *     b. Route to best model profile.
     *     c. Call LLM (native tools or untooled fallback).
     *     d. Output processors (may modify action).
     *     e. If action = "none" → done.
     *     f. Execute tool → append result to context.
     *  3. If loop exhausted → self-debug summary.
     *
     * @param task    - The user's natural-language task.
     * @param options - Optional forced profile or step limit.
     */
    async run(
        task: string,
        options?: { profile?: ModelProfile; maxSteps?: number }
    ): Promise<IAgentRunResult> {
        const ctx = new RunContext();

        // Resolve operating mode (determines step/tool limits)
        const modeConfig = resolveOperatingModeConfig();
        const effectiveMaxSteps =
            typeof options?.maxSteps === 'number' && options.maxSteps > 0
                ? options.maxSteps
                : modeConfig.maxSteps;
        const effectiveMaxToolCalls = Math.max(1, modeConfig.maxToolCalls);

        logger.info('agent_run_started', {
            component: 'agent',
            task,
            taskLength: task.length,
            maxSteps: effectiveMaxSteps,
            toolCount: this.tools.length
        });

        // ── Step 1: Load memory ────────────────────────────────────────────
        const memoryStartedAt = Date.now();
        const memory = await getMemory(task);
        logger.info('agent_memory_loaded', {
            component: 'agent',
            memoryCount: memory.length,
            durationMs: Date.now() - memoryStartedAt
        });

        emit({
            type: 'agent:start',
            payload: {
                runId: ctx.runId,
                task,
                startedAt: ctx.startTime.toISOString(),
                memoryCount: memory.length
            }
        });

        // ── Step 2: Reasoning loop ─────────────────────────────────────────
        for (let step = 0; step < effectiveMaxSteps; step++) {
            const stepStartedAt = Date.now();

            // 2a. Input processors (may throw PolicyViolationError → hard stop)
            let inputArgs: IProcessInputStepArgs;
            try {
                inputArgs = await this.runInputProcessors({
                    task,
                    context: ctx.context,
                    memory,
                    stepNumber: step,
                    tools: this.tools.map((t) => t.name)
                });
            } catch (error: unknown) {
                if (error instanceof PolicyViolationError) {
                    return finalizeHardStop(ctx, task, error, memory, options?.profile);
                }
                throw error;
            }

            // 2b. Route to best model
            const route = await routeModel({
                task: inputArgs.task,
                context: inputArgs.context,
                step,
                forcedProfile: options?.profile,
                contextLength: inputArgs.context.length,
                cumulativeDurationMs: ctx.elapsedMs
            }).catch((error: unknown) => handleLlmError(error, step, ctx.runId));
            const availableTools = this.tools.filter((tool) => inputArgs.tools.includes(tool.name));

            ctx.profilesUsed.add(route.profile);
            emit({
                type: 'agent:model_routed',
                payload: {
                    runId: ctx.runId,
                    step,
                    profile: route.profile,
                    model: route.model,
                    reason: route.reason,
                    contextLength: inputArgs.context.length
                }
            });

            // 2c. Direct-answer shortcut (no tools, no context, step 0)
            if (step === 0 && !inputArgs.context && availableTools.length === 0) {
                const answer = await this.handleDirectAnswer(
                    ctx, inputArgs, route, memory, task, step, options?.profile
                );
                if (answer) return answer;
            }

            // 2d. LLM call loop (may call multiple tools per step)
            const nativeToolCalling = await modelSupportsNativeToolCalling(route.model);
            let toolCallsThisStep = 0;

            while (toolCallsThisStep < effectiveMaxToolCalls) {
                // Call LLM using appropriate strategy
                let parsed: IParsedToolCall;
                let rawResponseText = '';
                let llmDurationMs: number | undefined;

                if (nativeToolCalling) {
                    const result = await callWithNativeTools(
                        ctx, inputArgs.task, inputArgs.memory, availableTools, route, step
                    );
                    parsed = result.parsed;
                    rawResponseText = result.rawResponseText;
                    llmDurationMs = result.llmDurationMs;
                } else {
                    const result = await callWithoutNativeTools(
                        ctx, inputArgs.task, inputArgs.memory, availableTools,
                        route, step, inputArgs.context
                    );
                    if (!result) {
                        // JSON parse failed — append error feedback and break
                        ctx.context +=
                            '\nYour previous response was not valid JSON. ' +
                            'Return plain text for final answers or JSON tool calls only.';
                        ctx.diagnosticEntries.push({
                            timestamp: new Date().toISOString(),
                            step,
                            severity: 'warn',
                            category: 'json',
                            message: 'Invalid JSON response from untooled fallback model.',
                            metadata: { responseLength: 0 }
                        });
                        break;
                    }
                    parsed = result.parsed;
                    rawResponseText = result.rawResponseText;
                    llmDurationMs = result.llmDurationMs;
                }

                // Emit step event
                logger.info('agent_step_parsed', {
                    component: 'agent',
                    step,
                    action: parsed.action,
                    thoughtLength: parsed.thought.length
                });
                emit({
                    type: 'agent:step',
                    payload: {
                        runId: ctx.runId,
                        step,
                        parsed,
                        metrics: {
                            step,
                            contextLength: inputArgs.context.length,
                            stepDurationMs: Date.now() - stepStartedAt,
                            durationMs: llmDurationMs
                        }
                    }
                });

                // 2e. Output processors (may modify action or hard-stop)
                let outputArgs: IProcessOutputStepArgs;
                try {
                    outputArgs = await this.runOutputProcessors({
                        task,
                        stepNumber: step,
                        text: rawResponseText,
                        thought: parsed.thought,
                        action: parsed.action,
                        toolInput: parsed.input
                    });
                } catch (error: unknown) {
                    if (error instanceof PolicyViolationError) {
                        await runToolResultProcessors(this.processors, {
                            task,
                            stepNumber: step,
                            tool: parsed.action,
                            input: parsed.input,
                            success: false,
                            error: error.message,
                            errorCode: error.code,
                            durationMs: 0
                        });
                        return finalizeHardStop(ctx, task, error, memory, options?.profile);
                    }
                    throw error;
                }
                parsed = {
                    thought: outputArgs.thought,
                    action: outputArgs.action,
                    input: outputArgs.toolInput
                };

                // 2f. If no action needed → run is complete
                if (parsed.action === 'none') {
                    return finalizeCompleted(ctx, task, parsed.thought, memory, options?.profile);
                }

                // 2g. Find and execute the tool
                const tool = availableTools.find((entry) => entry.name === parsed.action);
                if (!tool) {
                    await handleUnknownTool(
                        ctx, parsed, availableTools, step, task, this.processors
                    );
                    break;
                }

                // Check for duplicate calls
                const isDuplicate = await handleDuplicateCheck(
                    ctx, parsed, step, task, this.processors
                );
                if (isDuplicate) {
                    toolCallsThisStep += 1;
                    continue;
                }

                // Execute the tool
                const outcome = await executeTool(
                    ctx, tool, parsed, step, task, this.processors, route.model
                );

                if (outcome.directAnswer) {
                    return finalizeDirectOutput(
                        ctx, task, outcome.directAnswer, memory, options?.profile
                    );
                }
                if (outcome.shouldBreak) break;
                toolCallsThisStep += 1;
            }

            // Tool-call budget exhausted for this step
            if (toolCallsThisStep >= effectiveMaxToolCalls) {
                ctx.context += `\nReached AGENT_MAX_TOOL_CALLS (${effectiveMaxToolCalls}) for step ${step}.`;
                ctx.diagnosticEntries.push({
                    timestamp: new Date().toISOString(),
                    step,
                    severity: 'warn',
                    category: 'tool',
                    message: `Step exceeded AGENT_MAX_TOOL_CALLS (${effectiveMaxToolCalls}).`
                });
            }

            logger.info('agent_step_finished', {
                component: 'agent',
                step,
                durationMs: Date.now() - stepStartedAt,
                contextLength: ctx.context.length
            });
        }

        // ── Step 3: Loop exhausted → finalize with self-debug ──────────────
        return finalizeMaxSteps(
            ctx, task, memory, modeConfig.selfDebugEnabled, options?.profile
        );
    }

    /* ── Direct-answer shortcut ──────────────────────────────────────────── */

    /**
     * Handle the special case: step 0, no context, no tools available.
     * Just ask the LLM directly without tool scaffolding.
     */
    private async handleDirectAnswer(
        ctx: RunContext,
        inputArgs: IProcessInputStepArgs,
        route: { model: string; profile: ModelProfile; reason: string; options?: Record<string, unknown> },
        memory: string[],
        task: string,
        step: number,
        forcedProfile?: ModelProfile
    ): Promise<IAgentRunResult | null> {
        const memoryBlock =
            inputArgs.memory.length > 0
                ? `Relevant context:\n${inputArgs.memory.join('\n')}\n\n`
                : '';
        const directPrompt = `${memoryBlock}Task:\n${inputArgs.task}\n\nAnswer concisely and directly.`;

        logger.info('agent_direct_answer', {
            component: 'agent',
            step,
            reason: route.reason
        });

        const directResult = await generateWithMetadata(directPrompt, {
            model: route.model,
            images: ctx.pendingImages.length > 0 ? ctx.pendingImages : undefined,
            options: route.options
        }).catch((error: unknown) => handleLlmError(error, step, ctx.runId));
        ctx.pendingImages = [];

        ctx.llmSteps += 1;
        ctx.modelsUsed.add(directResult.model ?? route.model);
        accumulateTokens(ctx.tokens, directResult);

        const answer = directResult.response.trim();
        return finalizeCompleted(ctx, task, answer, memory, forcedProfile);
    }
}
