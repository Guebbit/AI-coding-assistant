/**
 * Shared agent wiring — constructs and exports the pre-built `Agent`
 * instances and the `createAgent` selector used by all API route modules.
 *
 * Extracting agent setup into this module avoids duplication between
 * `index.ts` and `openai-compat.ts` while keeping each route module
 * focused on its own HTTP concerns.
 *
 * @module apps/api/agents
 */

import { Agent } from "../../packages/agent/agent";
import type { ModelProfile } from "../../packages/agent/model-router";
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
} from "../../packages/tools/index";

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
];

/** Tools that mutate the filesystem — only enabled when `allowWrite` is `true`. */
const writeTools = [writeFileTool, scaffoldProjectTool];

/* ── Agent instances (shared across requests) ────────────────────────── */

/** Agent with read-only tool access (default). */
export const readOnlyAgent = new Agent(readOnlyTools);

/** Agent with both read and write tool access. */
export const writeEnabledAgent = new Agent([...readOnlyTools, ...writeTools]);

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
