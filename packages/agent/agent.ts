/**
 * Core agent module — implements the reason → act → observe loop.
 *
 * The `Agent` class orchestrates the entire agentic workflow:
 *  1. Load relevant memory for the task.
 *  2. For each step (up to `MAX_STEPS`):
 *     a. Run `processInputStep` hooks (middleware before LLM call).
 *     b. Build a prompt with the task, accumulated context, and memory.
 *     c. Route to the best model via `routeModel`.
 *     d. Call the LLM and parse the JSON response with Zod.
 *     e. Run `processOutputStep` hooks (middleware after LLM call).
 *     f. Execute the chosen tool, or return if `action === "none"`.
 *     g. Append the tool result to context and repeat.
 *
 * Design principles:
 *  - **No magic** — every decision is traceable via structured logs and events.
 *  - **Resilient** — bad JSON and unknown tools are recovered, not crashed.
 *  - **Observable** — every significant state change emits a typed event.
 *  - **Extensible** — processors can intercept input/output at each step.
 *
 * @module agent/agent
 */

import { generateWithMetadata } from '../llm/ollama';
import { generate } from '../llm/ollama';
import { addMemory, getMemory } from '../memory/memory';
import { emit } from '../events/bus';
import type { ITool } from '../tools';
import { getLogger } from '../logger/logger';
import { routeModel } from './model-router';
import type { ModelProfile } from './model-router';
import { agentStepSchema } from './schemas';
import type { AgentStep } from './schemas';
import type {
    IProcessor,
    IProcessInputStepArgs,
    IProcessOutputStepArgs
} from '../processors/types';
import { writeDiagnosticLog, cleanupOldLogs } from '../diagnostics';
import type { IDiagnosticEntry } from '../diagnostics';

/**
 * Maximum number of reasoning iterations before the agent gives up.
 * Configurable via the `AGENTS_MAX_STEPS` environment variable.
 */
const MAX_STEPS = Number.parseInt(process.env.AGENTS_MAX_STEPS ?? '5', 10);

/**
 * Fast model used for the self-debug summary on max-steps exhaustion.
 * Mirrors the value configured in the model router.
 */
const FAST_MODEL =
    process.env.AGENT_MODEL_FAST ??
    process.env.AGENT_MODEL_DEFAULT ??
    process.env.OLLAMA_MODEL ??
    'llama3';

/**
 * Directory where diagnostic Markdown files are written.
 * Kept in sync with the writer's own default.
 */
const DIAGNOSTIC_LOG_DIR = process.env.DIAGNOSTIC_LOG_DIR ?? 'data/diagnostics';

/**
 * Auto-prune threshold for diagnostic log files.
 */
const DIAGNOSTIC_LOG_MAX_FILES = Number.parseInt(process.env.DIAGNOSTIC_LOG_MAX_FILES ?? '100', 10);

const log = getLogger('agent');

/**
 * The core agent — wraps tools, processors, memory, and an LLM into a
 * single `run()` method that executes an agentic reasoning loop.
 *
 * Usage:
 * ```typescript
 * const agent = new Agent([readFileTool, shellTool]);
 * const answer = await agent.run("List all TypeScript files in src/");
 * ```
 */
export class Agent {
    /** Registered processors (middleware hooks), invoked in order. */
    private readonly processors: IProcessor[] = [];

    /**
     * Create a new Agent.
     *
     * @param tools - The set of tools the agent is allowed to use.
     *                The agent loop discovers tools from this array.
     */
    constructor(private readonly tools: ITool[]) {}

    /**
     * Register a processor whose hooks will be called at each agent step.
     *
     * Processors are invoked in registration order.  A processor may
     * return a modified argument object to influence the agent, or
     * return `void` / `undefined` to leave the arguments unchanged.
     *
     * @param processor - The processor to register.
     * @returns `this` for fluent chaining.
     */
    addProcessor(processor: IProcessor): this {
        this.processors.push(processor);
        return this;
    }

    /**
     * Execute the full agentic loop for a given task.
     *
     * Optionally accepts a `profile` override that forces the model
     * router to use a specific profile for every step, bypassing
     * automatic routing.
     *
     * Optionally accepts a `maxSteps` override that bounds this specific
     * run independently of the global `AGENTS_MAX_STEPS` env var.  This
     * is used by the workflow orchestrator to give each step its own cap.
     *
     * @param task    - The user's natural-language task description.
     * @param options - Optional configuration (e.g. `{ profile: "code", maxSteps: 10 }`).
     * @returns The agent's final answer as a string.
     */
    async run(
        task: string,
        options?: { profile?: ModelProfile; maxSteps?: number }
    ): Promise<string> {
        const runStartedAt = Date.now();
        let context = '';
        const diagnosticEntries: IDiagnosticEntry[] = [];

        /* Use per-call override when provided; fall back to the global default. */
        const effectiveMaxSteps =
            typeof options?.maxSteps === 'number' && options.maxSteps > 0
                ? options.maxSteps
                : MAX_STEPS;

        log.info('agent_run_started', {
            task,
            taskLength: task.length,
            maxSteps: effectiveMaxSteps,
            toolCount: this.tools.length
        });

        /* Load semantic + recent memory relevant to this task. */
        const memoryStartedAt = Date.now();
        const memory = await getMemory(task);
        log.info('agent_memory_loaded', {
            memoryCount: memory.length,
            durationMs: Date.now() - memoryStartedAt
        });

        emit({ type: 'agent:start', payload: { task } });

        for (let step = 0; step < effectiveMaxSteps; step++) {
            const stepStartedAt = Date.now();

            // ── Run input processors ─────────────────────────────────────────
            let inputArgs: IProcessInputStepArgs = {
                task,
                context,
                memory,
                stepNumber: step,
                tools: this.tools.map((t) => t.name)
            };
            for (const proc of this.processors) {
                if (proc.processInputStep) {
                    const result = await proc.processInputStep(inputArgs);
                    if (result) inputArgs = result;
                }
            }

            const prompt = this.buildPrompt(inputArgs.task, inputArgs.context, inputArgs.memory);
            log.info('agent_step_started', {
                step,
                contextLength: inputArgs.context.length,
                promptLength: prompt.length,
                promptPreview: prompt.length > 300 ? prompt.slice(0, 300) + '…' : prompt
            });

            // ── Call the LLM ─────────────────────────────────────────────────
            const response = await routeModel({
                task: inputArgs.task,
                context: inputArgs.context,
                step,
                forcedProfile: options?.profile,
                contextLength: inputArgs.context.length,
                cumulativeDurationMs: Date.now() - runStartedAt
            })
                .then(async (route) => {
                    emit({
                        type: 'agent:model_routed',
                        payload: {
                            step,
                            profile: route.profile,
                            model: route.model,
                            reason: route.reason
                        }
                    });
                    const llmStartedAt = Date.now();
                    const llmResult = await generateWithMetadata(prompt, {
                        model: route.model,
                        options: route.options
                    });
                    log.info('agent_llm_response_received', {
                        step,
                        responseLength: llmResult.response.length,
                        durationMs: Date.now() - llmStartedAt,
                        routedProfile: route.profile,
                        routedReason: route.reason,
                        model: llmResult.model,
                        done: llmResult.done,
                        doneReason: llmResult.doneReason,
                        totalDurationNs: llmResult.totalDurationNs,
                        loadDurationNs: llmResult.loadDurationNs,
                        promptEvalCount: llmResult.promptEvalCount,
                        promptEvalDurationNs: llmResult.promptEvalDurationNs,
                        evalCount: llmResult.evalCount,
                        evalDurationNs: llmResult.evalDurationNs
                    });
                    return llmResult.response;
                })
                .catch((error: unknown) => {
                    log.error('agent_llm_call_failed', { step, error: String(error) });
                    emit({ type: 'agent:error', payload: { step, error: String(error) } });
                    throw error;
                });

            // ── Parse the LLM response with Zod schema validation ────────────
            let parsed: AgentStep;
            try {
                /* Strip markdown code fences that some models wrap around JSON. */
                const cleaned = response.replace(/```(?:json)?\n?/g, '').trim();
                parsed = agentStepSchema.parse(JSON.parse(cleaned));
            } catch {
                /* Give the model a chance to self-correct on the next iteration. */
                context +=
                    '\nYour previous response was not valid JSON. ' +
                    'Please respond ONLY with a single valid JSON object.';
                log.warn('agent_invalid_json_response', {
                    step,
                    responseLength: response.length,
                    contextLength: context.length
                });
                diagnosticEntries.push({
                    timestamp: new Date().toISOString(),
                    step,
                    severity: 'warn',
                    category: 'json',
                    message: 'Invalid JSON response from LLM — asking model to self-correct.',
                    metadata: { responseLength: response.length }
                });
                continue;
            }

            log.info('agent_step_parsed', {
                step,
                action: parsed.action,
                thoughtLength: parsed.thought.length
            });
            emit({ type: 'agent:step', payload: { step, parsed } });

            // ── Run output processors ────────────────────────────────────────
            let outputArgs: IProcessOutputStepArgs = {
                task,
                stepNumber: step,
                text: response,
                thought: parsed.thought,
                action: parsed.action,
                toolInput: parsed.input
            };
            for (const proc of this.processors) {
                if (proc.processOutputStep) {
                    const result = await proc.processOutputStep(outputArgs);
                    if (result) outputArgs = result;
                }
            }
            /* Reflect any processor overrides back into the parsed step. */
            parsed = {
                thought: outputArgs.thought,
                action: outputArgs.action,
                input: outputArgs.toolInput
            };

            // ── Done — no tool action needed ─────────────────────────────────
            if (parsed.action === 'none') {
                await addMemory(`Task: ${task} → ${parsed.thought}`);
                log.info('agent_run_completed', {
                    step,
                    durationMs: Date.now() - runStartedAt,
                    finalThoughtLength: parsed.thought.length
                });
                emit({ type: 'agent:done', payload: { thought: parsed.thought } });

                /* Write diagnostic log even on success when entries were collected. */
                if (diagnosticEntries.length > 0) {
                    const logPath = await writeDiagnosticLog(diagnosticEntries, task);
                    await cleanupOldLogs(DIAGNOSTIC_LOG_DIR, DIAGNOSTIC_LOG_MAX_FILES);
                    log.info('agent_diagnostic_log_written', { logPath });
                }

                return parsed.thought;
            }

            // ── Find and execute the requested tool ──────────────────────────
            const tool = this.tools.find((t) => t.name === parsed.action);
            if (!tool) {
                log.warn('agent_unknown_tool', {
                    step,
                    action: parsed.action,
                    availableTools: this.tools.map((t) => t.name)
                });
                context +=
                    `\nTool "${parsed.action}" does not exist. ` +
                    `Available tools: ${this.tools.map((t) => t.name).join(', ')}.`;
                diagnosticEntries.push({
                    timestamp: new Date().toISOString(),
                    step,
                    severity: 'warn',
                    category: 'tool',
                    message: `Unknown tool requested: "${parsed.action}".`,
                    metadata: { availableTools: this.tools.map((t) => t.name) }
                });
                continue;
            }

            const toolStartedAt = Date.now();
            const toolResult = await tool
                .execute(parsed.input)
                .then((result) => {
                    let resultSize = -1;
                    try {
                        resultSize = JSON.stringify(result).length;
                    } catch {
                        log.warn('agent_tool_result_not_serializable', {
                            step,
                            tool: parsed.action
                        });
                    }
                    log.info('agent_tool_executed', {
                        step,
                        tool: parsed.action,
                        durationMs: Date.now() - toolStartedAt,
                        resultSize
                    });
                    return { success: true as const, result };
                })
                .catch((error: unknown) => {
                    context += `\nTool "${parsed.action}" failed: ${String(error)}`;
                    log.warn('agent_tool_failed', {
                        step,
                        tool: parsed.action,
                        error: String(error)
                    });
                    emit({
                        type: 'tool:error',
                        payload: { tool: parsed.action, error: String(error) }
                    });
                    diagnosticEntries.push({
                        timestamp: new Date().toISOString(),
                        step,
                        severity: 'error',
                        category: 'tool',
                        message: `Tool "${parsed.action}" failed: ${String(error)}`,
                        metadata: { tool: parsed.action }
                    });
                    return { success: false as const };
                });
            if (!toolResult.success) continue;
            const { result } = toolResult;

            emit({ type: 'tool:result', payload: { tool: parsed.action, result } });
            context += `\nStep ${step} — "${parsed.action}" returned: ${JSON.stringify(result)}`;
            log.info('agent_step_finished', {
                step,
                durationMs: Date.now() - stepStartedAt,
                contextLength: context.length
            });
        }

        /* Loop exhausted without the model returning action "none". */
        log.warn('agent_max_steps_reached', {
            durationMs: Date.now() - runStartedAt,
            task
        });

        /* ── Phase 2B: Self-debugging summary ─────────────────────────── */
        const debugPrompt =
            `You are a debugging assistant.\n` +
            `The agent loop exhausted its steps without completing the task.\n\n` +
            `Task:\n${task}\n\n` +
            `Context (what happened):\n${context}\n\n` +
            `Summarise concisely:\n` +
            `1. What was tried.\n` +
            `2. Where it got stuck.\n` +
            `3. Suggestions for what to try next.`;
        const summary = await generate(debugPrompt, { model: FAST_MODEL, stream: false })
            .then((result) => result.trim() || 'Max steps reached without a conclusive answer.')
            .catch((error: unknown) => {
                log.warn('agent_self_debug_failed', { error: String(error) });
                return 'Max steps reached without a conclusive answer.';
            });

        /* Persist the dead-end so future runs can avoid repeating it. */
        await addMemory(`Task: ${task} → [MAX_STEPS] ${summary}`).catch((error: unknown) =>
            log.warn('agent_memory_add_failed', { error: String(error) })
        );

        /* Write the full diagnostic log with the AI commentary. */
        let diagnosticFile = '';
        await writeDiagnosticLog(diagnosticEntries, task, summary)
            .then(async (logPath) => {
                diagnosticFile = logPath;
                await cleanupOldLogs(DIAGNOSTIC_LOG_DIR, DIAGNOSTIC_LOG_MAX_FILES);
            })
            .catch((error: unknown) =>
                log.warn('agent_diagnostic_log_failed', { error: String(error) })
            );

        emit({
            type: 'agent:max_steps',
            payload: { task, summary, diagnosticFile }
        });
        return summary;
    }

    /**
     * Assemble the full prompt string sent to the LLM at each step.
     *
     * The prompt contains:
     * - A system preamble describing the agent's role.
     * - The user's task.
     * - Relevant memory entries (if any).
     * - Accumulated context from previous steps.
     * - The list of available tools with descriptions.
     * - The expected JSON response schema.
     *
     * @param task    - The user's task description.
     * @param context - Accumulated context from prior steps.
     * @param memory  - Relevant memory strings.
     * @returns The fully assembled prompt string.
     */
    private buildPrompt(task: string, context: string, memory: string[]): string {
        const memoryBlock = memory.length > 0 ? `Recent memory:\n${memory.join('\n')}\n\n` : '';

        const contextBlock = context ? `Context so far:\n${context}\n\n` : '';

        const toolList = this.tools.map((t) => `- ${t.name}: ${t.description}`).join('\n');

        return (
            `You are an AI agent with access to tools.\n\n` +
            `Task:\n${task}\n\n` +
            memoryBlock +
            contextBlock +
            `Available tools:\n${toolList}\n\n` +
            `Respond ONLY with a single valid JSON object — no markdown, no extra text:\n` +
            `{\n` +
            `  "thought": "your reasoning",\n` +
            `  "action": "tool_name or none",\n` +
            `  "input": {}\n` +
            `}\n\n` +
            `Use action "none" when the task is fully complete.`
        );
    }
}
