/** Aggregate speculation performance counters. */
export interface EngineMetrics {
  predicts: number;
  branchesOpened: number;
  preExecuted: number;
  hits: number;
  misses: number;
  rollbacks: number;
  /** Sum of confirm latencies on hits (ms). */
  hitLatencyTotalMs: number;
  /** Sum of cold-path latencies on misses (ms). */
  missLatencyTotalMs: number;
  /** Estimated compute saved by hits (pre-exec duration attributed at commit). */
  estimatedSavedMs: number;
}

export function emptyMetrics(): EngineMetrics {
  return {
    predicts: 0,
    branchesOpened: 0,
    preExecuted: 0,
    hits: 0,
    misses: 0,
    rollbacks: 0,
    hitLatencyTotalMs: 0,
    missLatencyTotalMs: 0,
    estimatedSavedMs: 0,
  };
}

export interface MetricsSummary extends EngineMetrics {
  hitRate: number;
  avgHitLatencyMs: number;
  avgMissLatencyMs: number;
}

export function summarizeMetrics(m: EngineMetrics): MetricsSummary {
  const confirms = m.hits + m.misses;
  return {
    ...m,
    hitRate: confirms === 0 ? 0 : Number((m.hits / confirms).toFixed(4)),
    avgHitLatencyMs:
      m.hits === 0 ? 0 : Number((m.hitLatencyTotalMs / m.hits).toFixed(3)),
    avgMissLatencyMs:
      m.misses === 0 ? 0 : Number((m.missLatencyTotalMs / m.misses).toFixed(3)),
  };
}
