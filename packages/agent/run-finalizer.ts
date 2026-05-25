/**
 * Run finalizer — persistence, diagnostics, memory, and event emission
 * for completing an agent run (success, max-steps, or hard-stop).
 *
 * WHY: The original agent.ts had repeated "finish the run" blocks
 * (persist + emit + return) in multiple places. This module
 * consolidates them (DRY) and gives each exit path a clear name.
 *
 * @module agent/run-finalizer
 */

import { addMemory } from '../memory/memory';
import { emit } from '../events/bus';
import { logger } from '../logger/logger';
import { generate } from '../llm/ollama';
import { resolveModel } from '../shared';
import { writeDiagnosticLog, cleanupOldLogs } from '../diagnostics';
import type { IDiagnosticEntry } from '../diagnostics';
import { saveAgentRun } from '../persistence/db';
import { PolicyViolationError } from '../processors/policy';
import type { IToolCitation } from '../tools/citations';
import type { RunContext, IAgentRunMeta, IAgentRunResult } from './run-context';
import type { ModelProfile } from './model-router';
import type { IToolCall } from '../persistence/types';

/* ── Config ──────────────────────────────────────────────────────────────── */

const DIAGNOSTIC_LOG_DIR = process.env.DIAGNOSTIC_LOG_DIR ?? 'data/diagnostics';
const DIAGNOSTIC_LOG_MAX_FILES = Number.parseInt(process.env.DIAGNOSTIC_LOG_MAX_FILES ?? '100', 10);

/* ── Diagnostics writer ──────────────────────────────────────────────────── */

/**
 * Write diagnostics to disk and prune old logs if entries were collected.
 */
export function writeDiagnostics(
    entries: IDiagnosticEntry[],
    task: string,
    summary?: string
): Promise<string> {
    if (entries.length === 0 && !summary) return Promise.resolve('');
    return writeDiagnosticLog(entries, task, summary)
        .then(async (logPath) => {
            await cleanupOldLogs(DIAGNOSTIC_LOG_DIR, DIAGNOSTIC_LOG_MAX_FILES);
            logger.info('agent_diagnostic_log_written', { component: 'agent', logPath });
            return logPath;
        })
        .catch((error: unknown) => {
            logger.warn('agent_diagnostic_log_failed', {
                component: 'agent',
                error: String(error)
            });
            return '';
        });
}

/* ── Persistence helper ──────────────────────────────────────────────────── */

/**
 * Persist an agent run to PostgreSQL (fail-open — never throws).
 */
export function persistRun(input: Parameters<typeof saveAgentRun>[0]): Promise<void> {
    return saveAgentRun(input)
        .then(() => undefined)
        .catch((error: unknown) => {
            logger.warn('agent_persist_failed', {
                component: 'agent',
                error: String(error)
            });
        });
}

/* ── Shared state builder for persistence ────────────────────────────────── */

/** Build the persistence input object from the current run state. */
export function buildPersistInput(
    ctx: RunContext,
    task: string,
    output: string,
    status: 'completed' | 'max_steps' | 'hard_stopped',
    memory: string[],
    profile?: ModelProfile | null
) {
    return {
        task,
        agentProfile: profile ?? null,
        output,
        context: ctx.context,
        memory,
        startTime: ctx.startTime,
        endTime: new Date(),
        durationMs: ctx.elapsedMs,
        toolCalls: ctx.toolCalls,
        diagnosticEntries: ctx.diagnosticEntries,
        status
    };
}

/* ── Exit paths ──────────────────────────────────────────────────────────── */

/**
 * Finalize a successful run (agent returned action = "none").
 */
export async function finalizeCompleted(
    ctx: RunContext,
    task: string,
    answer: string,
    memory: string[],
    profile?: ModelProfile
): Promise<IAgentRunResult> {
    await addMemory(`Task: ${task} → ${answer}`);
    const citations = ctx.citationBuffer.flush();

    emit({
        type: 'agent:done',
        payload: {
            runId: ctx.runId,
            thought: answer,
            citations,
            citationsCount: citations.length,
            meta: ctx.buildRunMeta(profile, citations)
        }
    });

    await writeDiagnostics(ctx.diagnosticEntries, task);
    await persistRun(buildPersistInput(ctx, task, answer, 'completed', memory, profile));
    return { answer, meta: ctx.buildRunMeta(profile, citations), citations };
}

/**
 * Finalize a direct-output tool result (tool returned a final answer).
 */
export async function finalizeDirectOutput(
    ctx: RunContext,
    task: string,
    directAnswer: string,
    memory: string[],
    profile?: ModelProfile
): Promise<IAgentRunResult> {
    await addMemory(`Task: ${task} → ${directAnswer}`);
    const citations = ctx.citationBuffer.flush();

    emit({
        type: 'agent:done',
        payload: {
            runId: ctx.runId,
            thought: directAnswer,
            citations,
            citationsCount: citations.length,
            meta: ctx.buildRunMeta(profile, citations)
        }
    });

    await persistRun(buildPersistInput(ctx, task, directAnswer, 'completed', memory, profile));
    return { answer: directAnswer, meta: ctx.buildRunMeta(profile, citations), citations };
}

/**
 * Finalize a hard stop (policy violation).
 */
export async function finalizeHardStop(
    ctx: RunContext,
    task: string,
    violation: PolicyViolationError,
    memory: string[],
    profile?: ModelProfile
): Promise<IAgentRunResult> {
    const answer = violation.message;

    logger.warn('agent_hard_stop', {
        component: 'agent',
        step: violation.step,
        code: violation.code,
        durationMs: ctx.elapsedMs
    });
    ctx.diagnosticEntries.push({
        timestamp: new Date().toISOString(),
        step: violation.step,
        severity: 'error',
        category: 'policy',
        code: violation.code,
        message: `Hard stop: ${violation.message}`
    });
    emit({
        type: 'agent:hard_stop',
        payload: {
            runId: ctx.runId,
            step: violation.step,
            code: violation.code,
            reason: violation.message,
            meta: ctx.buildRunMeta(profile)
        }
    });

    await writeDiagnostics(ctx.diagnosticEntries, task);
    await persistRun(buildPersistInput(ctx, task, answer, 'hard_stopped', memory, profile));
    const citations = ctx.citationBuffer.flush();
    return { answer, meta: ctx.buildRunMeta(profile, citations), citations };
}

/**
 * Finalize a max-steps exhaustion (loop ended without the model returning "none").
 */
export async function finalizeMaxSteps(
    ctx: RunContext,
    task: string,
    memory: string[],
    selfDebugEnabled: boolean,
    profile?: ModelProfile
): Promise<IAgentRunResult> {
    logger.warn('agent_max_steps_reached', {
        component: 'agent',
        durationMs: ctx.elapsedMs,
        task
    });

    // Self-debugging summary using the fast model (gives insight into what went wrong)
    const summary = selfDebugEnabled
        ? await generate(
              `You are a debugging assistant.\n` +
                  `The agent loop exhausted its steps without completing the task.\n\n` +
                  `Task:\n${task}\n\n` +
                  `Context (what happened):\n${ctx.context}\n\n` +
                  `Summarise concisely:\n` +
                  `1. What was tried.\n` +
                  `2. Where it got stuck.\n` +
                  `3. Suggestions for what to try next.`,
              { model: resolveModel('fast'), stream: false }
          )
              .then((result) => result.trim() || 'Max steps reached without a conclusive answer.')
              .catch((error: unknown) => {
                  logger.warn('agent_self_debug_failed', {
                      component: 'agent',
                      error: String(error)
                  });
                  return 'Max steps reached without a conclusive answer.';
              })
        : 'Max steps reached without a conclusive answer.';

    await addMemory(`Task: ${task} → [MAX_STEPS] ${summary}`).catch((error: unknown) =>
        logger.warn('agent_memory_add_failed', {
            component: 'agent',
            error: String(error)
        })
    );

    const diagnosticFile = await writeDiagnostics(ctx.diagnosticEntries, task, summary);
    await persistRun(buildPersistInput(ctx, task, summary, 'max_steps', memory, profile));
    const citations = ctx.citationBuffer.flush();

    emit({
        type: 'agent:max_steps',
        payload: {
            runId: ctx.runId,
            task,
            summary,
            diagnosticFile,
            meta: ctx.buildRunMeta(profile, citations),
            citationsCount: citations.length
        }
    });
    return { answer: summary, meta: ctx.buildRunMeta(profile, citations), citations };
}
