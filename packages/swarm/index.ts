/**
 * Public surface of the swarm package.
 *
 * Import the {@link SwarmOrchestrator} class, the {@link decomposeTask}
 * function, or individual types from here.
 *
 * @module swarm
 */

export { SwarmOrchestrator } from "./orchestrator";
export { decomposeTask } from "./decomposer";
export type {
  ISubtask,
  IDecomposition,
  ISubtaskResult,
  ISwarmResult,
  ISwarmConfig,
} from "./types";
