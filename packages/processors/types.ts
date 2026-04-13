/**
 * Processor types — middleware-style hooks for the agent loop.
 *
 * Modelled after Mastra's processor pattern:
 *   https://mastra.ai/docs/agents/processors
 *
 * Processors let you intercept and optionally mutate what the agent sees
 * *before* it calls the LLM (`processInputStep`) and *after* it receives a
 * response but *before* any tool is executed (`processOutputStep`).
 *
 * ## Examples of what processors enable
 * - Inject dynamic context (e.g. current time, user preferences)
 * - Filter/swap the tool list per step
 * - Log / audit every LLM interaction
 * - Short-circuit tool execution (e.g. dry-run mode)
 * - Post-process output before the agent continues
 */

/**
 * Arguments passed to `processInputStep`.
 * A processor may return a modified copy to change what the agent sends
 * to the LLM, or return `void` / `undefined` to leave everything unchanged.
 */
export interface IProcessInputStepArgs {
    /** The task the agent was asked to perform. */
    task: string;

    /** Accumulated context from previous steps. */
    context: string;

    /** Relevant memory entries surfaced for this step. */
    memory: string[];

    /** Current step index (zero-based). */
    stepNumber: number;

    /** Names of the tools currently available to the agent. */
    tools: string[];
}

/**
 * Arguments passed to `processOutputStep`.
 * A processor may return a modified copy (e.g. to override the action)
 * or return `void` / `undefined` to leave everything unchanged.
 */
export interface IProcessOutputStepArgs {
    /** The original task the agent was asked to perform. */
    task: string;

    /** Current step index (zero-based). */
    stepNumber: number;

    /** The raw text response from the LLM. */
    text: string;

    /** Parsed reasoning from the LLM response. */
    thought: string;

    /** The action (tool name or "none") chosen by the LLM. */
    action: string;

    /** The input the LLM chose to supply to the selected tool. */
    toolInput: Record<string, unknown>;
}

/**
 * A Processor is an object with one or both lifecycle hooks.
 *
 * Both hooks are optional — implement only the ones you need.
 * Hooks may be synchronous or asynchronous.
 *
 * Processors are executed in registration order.  If a processor returns a
 * modified argument object, the *modified* version is forwarded to the next
 * processor in the chain (and ultimately used by the agent).
 */
export interface IProcessor {
    /**
     * Called *before* the LLM prompt is built for each step.
     *
     * Return a modified `ProcessInputStepArgs` to override context, memory,
     * or the tool list.  Return `void`/`undefined` to leave them unchanged.
     */
    processInputStep?(
        args: IProcessInputStepArgs
    ): Promise<IProcessInputStepArgs | void> | IProcessInputStepArgs | void;

    /**
     * Called *after* the LLM response is parsed, but *before* any tool runs.
     *
     * Return a modified `ProcessOutputStepArgs` to override the action or
     * tool input.  Return `void`/`undefined` to leave them unchanged.
     */
    processOutputStep?(
        args: IProcessOutputStepArgs
    ): Promise<IProcessOutputStepArgs | void> | IProcessOutputStepArgs | void;
}
