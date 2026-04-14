/**
 * Shared agent wiring — constructs and exports the pre-built `Agent`
 * instances, the `createAgent` selector, and the `SwarmOrchestrator`
 * factory used by all API route modules.
 *
 * Extracting agent setup into this module avoids duplication between
 * route modules while keeping each one focused on its own HTTP concerns.
 *
 * @module apps/api/agents
 */

import { Agent } from "../../packages/agent/agent";
import type { ModelProfile } from "../../packages/agent/model-router";
import { SwarmOrchestrator } from "../../packages/swarm/orchestrator";
import type { IProcessor } from "../../packages/processors/types";
import {
  readFileTool,
  writeFileTool,
  shellTool,
  mysqlQueryTool,
  browserTool,
  scaffoldProjectTool,
  imageClassifyTool,
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
} from "../../packages/tools/index";
import { verificationProcessor } from "../../packages/processors/verification";
import { createToolRerankerProcessor } from "../../packages/processors/tool-reranker";

/* ── Tool sets ───────────────────────────────────────────────────────── */

/** Tools that only read data — always available. */
const readOnlyTools = [
  readFileTool,
  shellTool,
  mysqlQueryTool,
  browserTool,
  imageClassifyTool,
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
];

/** Tools that mutate the filesystem or data stores — only enabled when `allowWrite` is `true`. */
const writeTools = [writeFileTool, scaffoldProjectTool, documentIngestTool];

/* ── Tool description map for the reranker ───────────────────────────── */

const allToolDescriptionMap = new Map<string, string>(
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

/* ── Agent instances (shared across requests) ────────────────────────── */

/** Agent with read-only tool access (default). */
export const readOnlyAgent = attachProcessors(new Agent(readOnlyTools));

/** Agent with both read and write tool access. */
export const writeEnabledAgent = attachProcessors(
  new Agent([...readOnlyTools, ...writeTools]),
);

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
 * Create a {@link SwarmOrchestrator} with the appropriate tool set and processors.
 *
 * @param allowWrite - Whether write tools should be available to worker agents.
 * @returns A configured `SwarmOrchestrator` instance.
 */
export function createSwarmOrchestrator(allowWrite: boolean): SwarmOrchestrator {
  const tools = allowWrite
    ? [...readOnlyTools, ...writeTools]
    : readOnlyTools;
  return new SwarmOrchestrator(tools, buildProcessors());
}
