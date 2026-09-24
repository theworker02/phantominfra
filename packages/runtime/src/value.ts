import type { MetricsSummary } from "./metrics.js";
import type { EffectLedgerEntry } from "./ledger.js";
import type { PredictorModel } from "./predictor.js";
import type { SpeculationPolicy } from "./policy.js";

/** Acquisition / diligence ready snapshot of engine economic value. */
export interface ValueReport {
  generatedAt: string;
  phase: string;
  metrics: MetricsSummary;
  ledgerSummary: {
    shadows: number;
    commits: number;
    compensates: number;
    failures: number;
  };
  /** Wall-clock ms avoided on speculative hits. */
  estimatedComputeSavedMs: number;
  /**
   * Rough dollar framing for diligence decks (configurable rate).
   * Default assumes $0.50 / CPU-hour equivalent at the edge ≈ $0.000000139 / ms.
   */
  estimatedValueUsd: number;
  assumptions: {
    usdPerCpuHour: number;
    note: string;
  };
  hitRate: number;
  avgHitLatencyMs: number;
  avgMissLatencyMs: number;
}

export interface AuditBundle {
  version: 1;
  generatedAt: string;
  value: ValueReport;
  predictor: PredictorModel;
  ledger: EffectLedgerEntry[];
  policy: SpeculationPolicy | null;
  history: string[];
  production: unknown;
}

export function buildValueReport(input: {
  metrics: MetricsSummary;
  ledgerSummary: {
    shadows: number;
    commits: number;
    compensates: number;
    failures: number;
  };
  usdPerCpuHour?: number;
  phase?: string;
}): ValueReport {
  const usdPerCpuHour = input.usdPerCpuHour ?? 0.5;
  const usdPerMs = usdPerCpuHour / 3_600_000;
  const saved = input.metrics.estimatedSavedMs;
  return {
    generatedAt: new Date().toISOString(),
    phase: input.phase ?? "runtime",
    metrics: input.metrics,
    ledgerSummary: input.ledgerSummary,
    estimatedComputeSavedMs: saved,
    estimatedValueUsd: Number((saved * usdPerMs).toFixed(8)),
    assumptions: {
      usdPerCpuHour,
      note: "Illustrative edge CPU-hour equivalent for diligence; replace with buyer unit economics.",
    },
    hitRate: input.metrics.hitRate,
    avgHitLatencyMs: input.metrics.avgHitLatencyMs,
    avgMissLatencyMs: input.metrics.avgMissLatencyMs,
  };
}
