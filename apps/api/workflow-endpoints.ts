/**
 * Workflow endpoints — sequential multi-step agent orchestration.
 *
 * Endpoints:
 * - `POST /workflow`        — run an explicit list of steps sequentially and
 *                             return full structured results for all steps.
 * - `POST /workflow/stream` — run the same workflow and emit SSE progress
 *                             events for each step lifecycle and completion.
 *
 * ## Design
 *
 * Each step in the `steps` array is executed as a **bounded sub-run** of the
 * normal `Agent.run()` loop.  The per-step iteration budget is controlled by
 * the `maxStepsPerStep` request field (defaults to `AGENTS_MAX_STEPS` env var,
 * or 5 if unset).  Each step is fully independent — a single slow or failing
 * step does not affect the budget of subsequent steps.
 *
 * ### Context carry modes (`carry`)
 *
 * | Mode      | Behaviour |
 * |-----------|-----------|
 * | `none`    | Each step receives only its own task string — no information from prior steps. |
 * | `summary` | A concise bullet-list summary of prior step results is appended to each subsequent step prompt. **(default)** |
 * | `full`    | The complete output of every prior step is appended verbatim. Useful for long documents; may grow context quickly. |
 *
 * @module apps/api/workflow-endpoints
 */

import { z } from 'zod';
import type { Express, Request, Response } from 'express';
import { on, off } from '../../packages/events/bus';
import type { IAgentEvent } from '../../packages/events/bus';
import { getLogger } from '../../packages/logger/logger';
import { createAgent, VALID_PROFILES } from './agents';
import type { ModelProfile } from '../../packages/agent/model-router';

const log = getLogger('workflow-endpoints');

/* ── Constants ───────────────────────────────────────────────────────── */

/** Maximum characters to include in SSE event data payloads. */
const SSE_PAYLOAD_MAX_LENGTH = 300;

/**
 * Global step cap read once at startup (mirrors `agent.ts`'s own constant).
 * Used as the default per-step budget when `maxStepsPerStep` is omitted.
 */
const DEFAULT_MAX_STEPS_PER_STEP = Number.parseInt(
    process.env.AGENTS_MAX_STEPS ?? '5',
    10,
);

/**
 * Hard upper bound on `maxStepsPerStep` to prevent accidental run-away
 * requests.
 */
const MAX_STEPS_PER_STEP_CEILING = 100;

/* ── Carry modes ─────────────────────────────────────────────────────── */

/**
 * Supported context-carry modes between workflow steps.
 *
 * - `none`    — no prior context forwarded.
 * - `summary` — a compact bullet-point summary of prior results.
 * - `full`    — the full raw output of every prior step.
 */
export const CARRY_MODES = ['none', 'summary', 'full'] as const;

/** Union type derived from the supported carry modes array. */
export type CarryMode = (typeof CARRY_MODES)[number];

/* ── Zod schema ──────────────────────────────────────────────────────── */

/**
 * Zod schema for the `POST /workflow` and `POST /workflow/stream` request
 * bodies.  Validation failures produce a structured 400 error response.
 */
export const workflowRequestSchema = z.object({
    /**
     * Ordered list of step task strings.  Each string is treated as an
     * independent natural-language task description submitted to a fresh
     * `agent.run()` call.  Minimum 1 step, maximum 50 steps per request.
     */
    steps: z
        .array(z.string().min(1, 'Each step must be a non-empty string'))
        .min(1, 'At least one step is required')
        .max(50, 'A workflow may contain at most 50 steps'),

    /**
     * Enable write-capable tools (`write_file`, `scaffold_project`,
     * `document_ingest`) for every step.  Defaults to `false`.
     */
    allowWrite: z.boolean().optional().default(false),

    /**
     * Force a specific model profile for every step, bypassing automatic
     * routing.  Must be one of the recognised profile names.
     */
    profile: z
        .enum(['fast', 'reasoning', 'code', 'default'])
        .optional(),

    /**
     * How prior step outputs are carried into subsequent steps.
     *
     * - `none`    — isolated steps; no prior context.
     * - `summary` — compact summary injected into each step prompt.
     * - `full`    — complete verbatim output appended to each step prompt.
     *
     * Defaults to `summary`.
     */
    carry: z.enum(['none', 'summary', 'full']).optional().default('summary'),

    /**
     * Per-step agent-loop iteration cap.  Overrides the global
     * `AGENTS_MAX_STEPS` env var for this request only.  Must be between
     * 1 and 100 (inclusive).  Defaults to the value of `AGENTS_MAX_STEPS`.
     */
    maxStepsPerStep: z
        .number()
        .int('maxStepsPerStep must be an integer')
        .min(1, 'maxStepsPerStep must be at least 1')
        .max(
            MAX_STEPS_PER_STEP_CEILING,
            `maxStepsPerStep must be at most ${MAX_STEPS_PER_STEP_CEILING}`,
        )
        .optional(),
});

/** Inferred TypeScript type from the workflow request Zod schema. */
export type WorkflowRequest = z.infer<typeof workflowRequestSchema>;

/* ── Result types ────────────────────────────────────────────────────── */

/**
 * Result record for a single workflow step.
 */
export interface IWorkflowStepResult {
    /** Zero-based index of this step in the workflow. */
    index: number;
    /** The original task string submitted for this step. */
    task: string;
    /** The agent's final answer for this step. */
    result: string;
    /** Whether the step completed without throwing. */
    success: boolean;
    /** Wall-clock duration in milliseconds for this step. */
    durationMs: number;
    /** Error message if `success` is `false`. */
    error?: string;
}

/**
 * Full response body for `POST /workflow`.
 */
export interface IWorkflowResponse {
    /** Per-step results in execution order. */
    steps: IWorkflowStepResult[];
    /** `true` when every step completed successfully. */
    allSucceeded: boolean;
    /** Total wall-clock duration in milliseconds across all steps. */
    totalDurationMs: number;
}

/**
 * Lifecycle callbacks used by the streaming handler to receive events
 * synchronously between steps without coupling into runWorkflow's loop.
 */
interface IWorkflowCallbacks {
    /** Called immediately before a step's `agent.run()` begins. */
    onStepStart?: (index: number, task: string) => void;
    /** Called after a step's `agent.run()` resolves or rejects. */
    onStepComplete?: (result: IWorkflowStepResult) => void;
}

/* ── Context carry helpers ───────────────────────────────────────────── */

/**
 * Build the preamble string injected into a step's task description based
 * on the carry mode and the results of prior steps.
 *
 * @param carry   - The selected carry mode.
 * @param priors  - All step results collected so far (before this step).
 * @returns A string to prepend to the step task, or an empty string when
 *          carry is `none` or there are no prior results.
 */
function buildCarryContext(carry: CarryMode, priors: IWorkflowStepResult[]): string {
    if (carry === 'none' || priors.length === 0) {
        return '';
    }

    if (carry === 'full') {
        const sections = priors
            .map((r, i) => `Step ${i + 1} — "${r.task}":\n${r.result}`)
            .join('\n\n');
        return `Previous step results:\n${sections}\n\n`;
    }

    /* carry === 'summary': one concise bullet per prior step. */
    const bullets = priors
        .map((r, i) => {
            const preview =
                r.result.length > 200 ? r.result.slice(0, 200) + '…' : r.result;
            return `- Step ${i + 1} ("${r.task.slice(0, 60)}"): ${preview}`;
        })
        .join('\n');
    return `Summary of prior steps:\n${bullets}\n\n`;
}

/* ── SSE helpers ─────────────────────────────────────────────────────── */

/**
 * Serialise an event as an SSE frame.
 *
 * @param eventType - The SSE event name.
 * @param data      - JSON-serialisable payload.
 * @returns A formatted SSE string ready to write to the response.
 */
function sseFrame(eventType: string, data: unknown): string {
    return `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
}

/* ── Core workflow runner ─────────────────────────────────────────────── */

/**
 * Execute a validated workflow request sequentially, collecting per-step
 * results.  Shared by both the non-streaming and streaming handlers.
 *
 * @param parsed    - Validated workflow request.
 * @param callbacks - Optional lifecycle callbacks for streaming integration.
 * @returns The full workflow result object.
 */
async function runWorkflow(
    parsed: WorkflowRequest,
    callbacks?: IWorkflowCallbacks,
): Promise<IWorkflowResponse> {
    const workflowStartedAt = Date.now();
    const stepResults: IWorkflowStepResult[] = [];
    const effectiveMaxSteps = parsed.maxStepsPerStep ?? DEFAULT_MAX_STEPS_PER_STEP;

    for (let i = 0; i < parsed.steps.length; i++) {
        const baseTask = parsed.steps[i];
        const carryPrefix = buildCarryContext(parsed.carry, stepResults);
        const fullTask = carryPrefix ? `${carryPrefix}Current task:\n${baseTask}` : baseTask;

        callbacks?.onStepStart?.(i, baseTask);

        const stepStartedAt = Date.now();
        let result: IWorkflowStepResult;

        try {
            const agent = createAgent(parsed.allowWrite);
            const answer = await agent.run(fullTask, {
                profile: parsed.profile as ModelProfile | undefined,
                maxSteps: effectiveMaxSteps,
            });

            result = {
                index: i,
                task: baseTask,
                result: answer,
                success: true,
                durationMs: Date.now() - stepStartedAt,
            };
        } catch (error) {
            result = {
                index: i,
                task: baseTask,
                result: '',
                success: false,
                durationMs: Date.now() - stepStartedAt,
                error: String(error),
            };
        }

        stepResults.push(result);
        callbacks?.onStepComplete?.(result);
    }

    return {
        steps: stepResults,
        allSucceeded: stepResults.every((r) => r.success),
        totalDurationMs: Date.now() - workflowStartedAt,
    };
}

/* ── Route registration ──────────────────────────────────────────────── */

/**
 * Register `POST /workflow` and `POST /workflow/stream` on the given
 * Express application.
 *
 * @param app - The Express application to attach routes to.
 */
export function registerWorkflowRoutes(app: Express): void {
    /* ── POST /workflow ───────────────────────────────────────────────── */
    /**
     * POST /workflow — run an explicit list of steps sequentially.
     *
     * Request body:
     * ```json
     * {
     *   "steps": ["read all .ts files", "summarise findings"],
     *   "carry": "summary",
     *   "allowWrite": false,
     *   "profile": "code",
     *   "maxStepsPerStep": 10
     * }
     * ```
     *
     * Response: `{ steps: [...], allSucceeded: bool, totalDurationMs: number }`
     */
    app.post('/workflow', async (req: Request, res: Response) => {
        const parseResult = workflowRequestSchema.safeParse(req.body);

        if (!parseResult.success) {
            const issues = parseResult.error.issues.map(
                (i) => `${i.path.join('.')}: ${i.message}`,
            );
            res.status(400).json({ error: 'Invalid workflow request', details: issues });
            return;
        }

        const parsed = parseResult.data;

        /* Extra profile check (Zod enum already validates, but defence-in-depth). */
        if (
            parsed.profile !== undefined &&
            !VALID_PROFILES.has(parsed.profile as ModelProfile)
        ) {
            res.status(400).json({
                error: `"profile" must be one of: ${[...VALID_PROFILES].join(', ')}`,
            });
            return;
        }

        log.info('workflow_request_received', {
            stepCount: parsed.steps.length,
            carry: parsed.carry,
            allowWrite: parsed.allowWrite,
            profile: parsed.profile ?? null,
            maxStepsPerStep: parsed.maxStepsPerStep ?? DEFAULT_MAX_STEPS_PER_STEP,
        });

        try {
            const response = await runWorkflow(parsed);

            log.info('workflow_request_completed', {
                stepCount: response.steps.length,
                allSucceeded: response.allSucceeded,
                totalDurationMs: response.totalDurationMs,
            });

            res.json(response);
        } catch (error) {
            log.error('workflow_request_failed', { error: String(error) });
            res.status(500).json({ error: String(error) });
        }
    });

    /* ── POST /workflow/stream ────────────────────────────────────────── */
    /**
     * POST /workflow/stream — run a workflow and stream lifecycle events as SSE.
     *
     * Same request body as `POST /workflow`.
     *
     * SSE event types emitted (in order):
     * - `workflow_start`  — before the first step; `{ stepCount }`.
     * - `step_start`      — before each step; `{ index, task }`.
     * - `step`            — inner agent iteration (from `agent:step`);
     *                       `{ workflowIndex, step, action, thought }`.
     * - `tool`            — tool result/error (from `tool:result`/`tool:error`);
     *                       `{ workflowIndex, tool, result? | error? }`.
     * - `route`           — model routing decision (from `agent:model_routed`);
     *                       `{ workflowIndex, profile, model, reason }`.
     * - `step_done`       — after each step completes; full {@link IWorkflowStepResult}.
     * - `done`            — after all steps finish; full {@link IWorkflowResponse}.
     * - `error`           — on fatal errors; `{ error }`.
     */
    app.post('/workflow/stream', (req: Request, res: Response) => {
        const parseResult = workflowRequestSchema.safeParse(req.body);

        if (!parseResult.success) {
            const issues = parseResult.error.issues.map(
                (i) => `${i.path.join('.')}: ${i.message}`,
            );
            res.status(400).json({ error: 'Invalid workflow request', details: issues });
            return;
        }

        const parsed = parseResult.data;

        if (
            parsed.profile !== undefined &&
            !VALID_PROFILES.has(parsed.profile as ModelProfile)
        ) {
            res.status(400).json({
                error: `"profile" must be one of: ${[...VALID_PROFILES].join(', ')}`,
            });
            return;
        }

        /* ── Set SSE headers ────────────────────────────────────────── */
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        const writeEvent = (eventType: string, data: unknown): void => {
            res.write(sseFrame(eventType, data));
        };

        /*
         * Track which workflow step is currently running so inner agent
         * events (from the global event bus) can be annotated with the
         * `workflowIndex`.
         */
        let currentWorkflowIndex = 0;

        /* ── Event bridge for inner agent events ────────────────────── */
        const handler = (event: IAgentEvent): void => {
            try {
                switch (event.type) {
                    case 'agent:step': {
                        const p = event.payload as {
                            step: number;
                            parsed: { thought: string; action: string };
                        };
                        writeEvent('step', {
                            workflowIndex: currentWorkflowIndex,
                            step: p.step,
                            action: p.parsed.action,
                            thought: p.parsed.thought.slice(0, SSE_PAYLOAD_MAX_LENGTH),
                        });
                        break;
                    }
                    case 'tool:result': {
                        const p = event.payload as { tool: string; result: unknown };
                        writeEvent('tool', {
                            workflowIndex: currentWorkflowIndex,
                            tool: p.tool,
                            result: JSON.stringify(p.result).slice(0, SSE_PAYLOAD_MAX_LENGTH),
                        });
                        break;
                    }
                    case 'tool:error': {
                        const p = event.payload as { tool: string; error: string };
                        writeEvent('tool', {
                            workflowIndex: currentWorkflowIndex,
                            tool: p.tool,
                            error: p.error,
                        });
                        break;
                    }
                    case 'agent:model_routed': {
                        const p = event.payload as {
                            profile: string;
                            model: string;
                            reason: string;
                        };
                        writeEvent('route', {
                            workflowIndex: currentWorkflowIndex,
                            profile: p.profile,
                            model: p.model,
                            reason: p.reason,
                        });
                        break;
                    }
                    default:
                        /* All other event types are silently ignored. */
                        break;
                }
            } catch (error) {
                log.warn('workflow_stream_event_write_failed', { error: String(error) });
            }
        };

        on('*', handler);

        log.info('workflow_stream_started', {
            stepCount: parsed.steps.length,
            carry: parsed.carry,
            allowWrite: parsed.allowWrite,
            profile: parsed.profile ?? null,
            maxStepsPerStep: parsed.maxStepsPerStep ?? DEFAULT_MAX_STEPS_PER_STEP,
        });

        writeEvent('workflow_start', { stepCount: parsed.steps.length });

        runWorkflow(parsed, {
            onStepStart: (index, task) => {
                currentWorkflowIndex = index;
                writeEvent('step_start', { index, task });
            },
            onStepComplete: (stepResult) => {
                writeEvent('step_done', stepResult);
            },
        })
            .then((workflowResponse) => {
                writeEvent('done', workflowResponse);
                log.info('workflow_stream_completed', {
                    stepCount: workflowResponse.steps.length,
                    allSucceeded: workflowResponse.allSucceeded,
                    totalDurationMs: workflowResponse.totalDurationMs,
                });
            })
            .catch((error: unknown) => {
                writeEvent('error', { error: String(error) });
                log.error('workflow_stream_failed', { error: String(error) });
            })
            .finally(() => {
                off('*', handler);
                res.end();
            });

        /* Clean up the event handler if the client disconnects early. */
        req.on('close', () => {
            off('*', handler);
        });
    });
}
