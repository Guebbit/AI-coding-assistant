/**
 * Shared agent wiring — constructs and exports the pre-built `Agent`
 * instances, the `createAgent` selector, and the swarm orchestrator
 * factory used by all API route modules.
 *
 * Extracting agent setup into this module avoids duplication between
 * route modules while keeping each one focused on its own HTTP concerns.
 *
 * @module apps/api/agents
 */

import { Agent } from "../../packages/agent/agent";
import type { ModelProfile } from "../../packages/agent/model-router";
import { loadMCPTools } from "../../packages/mcp";
import { logger } from "../../packages/logger/logger";
import { LangGraphSwarmOrchestrator } from "../../packages/orchestrator/graph";
import type { IProcessor } from "../../packages/processors/types";
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
} from "../../packages/tools/index";
import { verificationProcessor } from "../../packages/processors/verification";
import { createToolRerankerProcessor } from "../../packages/processors/tool-reranker";

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

/* ── Processor registration ──────────────────────────────────────────── */

/**
 * Build the list of active processors based on environment variables.
 *
 * Shared by both single-agent and swarm paths so the same middleware
 * applies regardless of execution mode.
 *
 * @returns An array of active {@link IProcessor} instances.
 */
function buildProcessors(): IProcessor[] {
  const procs: IProcessor[] = [];

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
 * @param agent - The `Agent` instance to configure.
 * @returns The same `agent` for fluent chaining.
 */
function attachProcessors(agent: Agent): Agent {
  for (const proc of buildProcessors()) {
    agent.addProcessor(proc);
  }
  return agent;
}

/**
 * Rebuild both shared agent instances using the current runtime tool sets.
 *
 * @returns Nothing.
 */
function rebuildAgents(): void {
  allToolDescriptionMap = new Map<string, string>(
    [...readOnlyTools, ...writeTools].map((tool) => [tool.name, tool.description]),
  );

  readOnlyAgent = attachProcessors(new Agent(readOnlyTools));
  writeEnabledAgent = attachProcessors(new Agent([...readOnlyTools, ...writeTools]));
}

/* ── Agent instances (shared across requests) ────────────────────────── */

/** Agent with read-only tool access (default). */
export let readOnlyAgent = attachProcessors(new Agent(readOnlyTools));

/** Agent with both read and write tool access. */
export let writeEnabledAgent = attachProcessors(
  new Agent([...readOnlyTools, ...writeTools]),
);

/**
 * Load MCP tools (fail-open) and rebuild shared agent singletons.
 *
 * This must be called during API startup, before `app.listen()`, so MCP
 * tools are available for the first request.
 *
 * @returns Nothing.
 */
export async function initializeAgents(): Promise<void> {
  try {
    const { readTools, writeTools: discoveredWriteTools, meta } = await loadMCPTools();
    readOnlyTools = [...nativeReadOnlyTools, ...readTools];
    writeTools = [...nativeWriteTools, ...discoveredWriteTools];
    rebuildAgents();

    logger.info("mcp_tools_loaded", {
      component: "api.agents",
      readTools: readTools.length,
      writeTools: discoveredWriteTools.length,
      totalMCPTools: meta.length,
    });
  } catch (error) {
    readOnlyTools = [...nativeReadOnlyTools];
    writeTools = [...nativeWriteTools];
    rebuildAgents();
    logger.warn("mcp_tools_load_failed", { component: "api.agents", error: String(error) });
  }
}

/** Recognised model profile names for request validation. */
export const VALID_PROFILES = new Set<ModelProfile>(["fast", "reasoning", "code", "default"]);

/**
 * Select the correct pre-built agent instance based on write permissions.
 *
 * @param allowWrite - Whether write tools should be available.
 * @returns The matching `Agent` instance.
 */
export function createAgent(allowWrite: boolean): Agent {
  return allowWrite ? writeEnabledAgent : readOnlyAgent;
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
  return new LangGraphSwarmOrchestrator(tools, buildProcessors());
}
