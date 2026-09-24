import type { RoutePredictor } from "./predictor.js";
import type { EngineMetrics } from "./metrics.js";

/** Serializable engine state for Durable Object / KV persistence. */
export interface EngineSnapshot<TState extends object = Record<string, unknown>> {
  version: 1;
  production: TState;
  history: string[];
  predictor: ReturnType<RoutePredictor["exportModel"]>;
  metrics: EngineMetrics;
  options: {
    topK: number;
    minProbability: number;
    branchTtlMs: number;
    coldPathDelayMs: number;
  };
}

export function createSnapshotId(): string {
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
