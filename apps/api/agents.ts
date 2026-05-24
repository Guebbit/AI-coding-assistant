/**
 * Shared agent wiring — constructs and exports the `createAgent`
 * selector and the swarm orchestrator factory used by all API route
 * modules.
 *
 * Extracting agent setup into this module avoids duplication between
 * route modules while keeping each one focused on its own HTTP concerns.
 *
 * @module apps/api/agents
 */

import { Agent } from "@/packages/agent/agent";
import type { ModelProfile } from "@/packages/agent/model-router";
import { PROFILE_LIST } from "@/packages/shared";
import { loadMCPTools } from "@/packages/mcp";
import { logger } from "@/packages/logger/logger";
import { LangGraphSwarmOrchestrator } from "@/packages/orchestrator/graph";
import type { IProcessor } from "@/packages/processors/types";
import { createPolicyProcessor } from "@/packages/processors/policy";
import {
  readFileTool,
  writeFileTool,
  shellTool,
  mysqlQueryTool,
  browserTool,
  scaffoldProjectTool,
  imageClassifyTool,
  imageSketchTool,
  imageColorizeTool,
  semanticSearchTool,
  speechToTextTool,
  readPdfTool,
  codeAutocompleteTool,
  generateDiagramTool,
  readDocxTool,
  readCsvTool,
  readHtmlTool,
  readJsonTool,
  readMarkdownTool,
  documentIngestTool,
  knowledgeGraphTool,
  queryKnowledgeGraphTool,
} from "@/packages/tools/index";
import { verificationProcessor } from "@/packages/processors/verification";
import { createToolRerankerProcessor } from "@/packages/processors/tool-reranker";

/* ── Tool sets ───────────────────────────────────────────────────────── */

/** Tools that only read data — always available. */
const nativeReadOnlyTools = [
  readFileTool,
  shellTool,
  mysqlQueryTool,
  browserTool,
  imageClassifyTool,
  imageSketchTool,
  imageColorizeTool,
  semanticSearchTool,
  speechToTextTool,
  readPdfTool,
  codeAutocompleteTool,
  generateDiagramTool,
  readDocxTool,
  readCsvTool,
  readHtmlTool,
  readJsonTool,
  readMarkdownTool,
  queryKnowledgeGraphTool,
];

/** Tools that mutate the filesystem or data stores — only enabled when `allowWrite` is `true`. */
const nativeWriteTools = [writeFileTool, scaffoldProjectTool, documentIngestTool, knowledgeGraphTool];

/** Runtime read-only tool set (native + MCP, once loaded). */
let readOnlyTools = [...nativeReadOnlyTools];

/** Runtime write-enabled tool set (native + MCP write tools, once loaded). */
let writeTools = [...nativeWriteTools];

/* ── Tool description map for the reranker ───────────────────────────── */

let allToolDescriptionMap = new Map<string, string>(
  [...readOnlyTools, ...writeTools].map((t) => [t.name, t.description]),
);

/* ── Write-tool names set (used by PolicyProcessor) ─────────────────── */

/** Names of tools that require `allowWrite: true`. */
const WRITE_TOOL_NAMES = new Set(nativeWriteTools.map((t) => t.name));

/* ── Processor registration ──────────────────────────────────────────── */

/**
 * Build the list of active processors based on environment variables.
 *
 * `PolicyProcessor` is always registered first so capability gates and
 * error-budget enforcement run before any other middleware.
 *
 * Shared by both single-agent and swarm paths so the same middleware
 * applies regardless of execution mode.
 *
 * @param allowWrite - Whether write tools are permitted for this agent instance.
 * @returns An array of active {@link IProcessor} instances.
 */
function buildProcessors(allowWrite: boolean): IProcessor[] {
  const procs: IProcessor[] = [];

  /* PolicyProcessor must be first — it enforces capability gates and budgets. */
  procs.push(
    createPolicyProcessor({
      allowWrite,
      writeToolNames: WRITE_TOOL_NAMES,
    }),
  );

  if (process.env.AGENT_VERIFICATION_ENABLED === "true") {
    procs.push(verificationProcessor);
  }

  if (process.env.TOOL_RERANKER_ENABLED === "true") {
    procs.push(createToolRerankerProcessor(allToolDescriptionMap));
  }

  return procs;
}

/**
 * Attach optional processors to an agent based on environment variables.
 *
 * @param agent      - The `Agent` instance to configure.
 * @param allowWrite - Whether write tools are permitted for this agent.
 * @returns The same `agent` for fluent chaining.
 */
function attachProcessors(agent: Agent, allowWrite: boolean): Agent {
  for (const proc of buildProcessors(allowWrite)) {
    agent.addProcessor(proc);
  }
  return agent;
}

/**
 * Refresh derived tool metadata using the current runtime tool sets.
 *
 * @returns Nothing.
 */
function rebuildAgents(): void {
  allToolDescriptionMap = new Map<string, string>(
    [...readOnlyTools, ...writeTools].map((tool) => [tool.name, tool.description]),
  );
}

/**
 * Load MCP tools (fail-open) and refresh runtime tool metadata.
 *
 * This must be called during API startup, before `app.listen()`, so MCP
 * tools are available for the first request.
 *
 * @returns Nothing.
 */
export function initializeAgents(): Promise<void> {
  return loadMCPTools()
    .then(({ readTools, writeTools: discoveredWriteTools, meta }) => {
      readOnlyTools = [...nativeReadOnlyTools, ...readTools];
      writeTools = [...nativeWriteTools, ...discoveredWriteTools];
      rebuildAgents();

      logger.info("mcp_tools_loaded", {
        component: "api.agents",
        readTools: readTools.length,
        writeTools: discoveredWriteTools.length,
        totalMCPTools: meta.length,
      });
    })
    .catch((error) => {
      readOnlyTools = [...nativeReadOnlyTools];
      writeTools = [...nativeWriteTools];
      rebuildAgents();
      logger.warn("mcp_tools_load_failed", { component: "api.agents", error: String(error) });
    });
}

/** Recognised model profile names for request validation. */
export const VALID_PROFILES = new Set<ModelProfile>(PROFILE_LIST);

/**
 * Create a fresh `Agent` instance for a single request.
 *
 * A new agent (with fresh processors) is constructed on every call so that
 * stateful processor state (e.g. the consecutive-error budget in
 * `PolicyProcessor`) never leaks from one request into the next.
 * Tool lists are shared module-level state updated by `initializeAgents`.
 *
 * @param allowWrite - Whether write tools should be available.
 * @returns A freshly-constructed `Agent` instance for this request.
 */
export function createAgent(allowWrite: boolean): Agent {
  const tools = allowWrite ? [...readOnlyTools, ...writeTools] : readOnlyTools;
  return attachProcessors(new Agent(tools), allowWrite);
}

/* ── Swarm factory ───────────────────────────────────────────────────── */

/**
 * Create a {@link LangGraphSwarmOrchestrator} with the appropriate tool set
 * and processors.
 *
 * The returned orchestrator is backed by a LangGraph state machine that
 * supports cyclic review→retry workflows.
 *
 * @param allowWrite - Whether write tools should be available to worker agents.
 * @returns A configured `LangGraphSwarmOrchestrator` instance.
 */
export function createSwarmOrchestrator(allowWrite: boolean): LangGraphSwarmOrchestrator {
  const tools = allowWrite
    ? [...readOnlyTools, ...writeTools]
    : readOnlyTools;
  return new LangGraphSwarmOrchestrator(tools, buildProcessors(allowWrite));
}
