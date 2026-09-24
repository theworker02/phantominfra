import type { ValueReport } from "@phantominfra/runtime";

/** Static diligence snapshot from last local bench run — update when rebenching. */
const SNAPSHOT: ValueReport = {
  generatedAt: new Date().toISOString(),
  phase: "bench-demo",
  metrics: {
    predicts: 80,
    branchesOpened: 80,
    preExecuted: 80,
    hits: 40,
    misses: 40,
    rollbacks: 40,
    hitLatencyTotalMs: 4,
    missLatencyTotalMs: 6232,
    estimatedSavedMs: 3200,
    hitRate: 0.5,
    avgHitLatencyMs: 0.1,
    avgMissLatencyMs: 155.8,
  },
  ledgerSummary: { shadows: 0, commits: 40, compensates: 0, failures: 0 },
  estimatedComputeSavedMs: 3200,
  estimatedValueUsd: 0.00000044,
  assumptions: {
    usdPerCpuHour: 0.5,
    note: "Illustrative — replace with buyer unit economics in diligence.",
  },
  hitRate: 0.5,
  avgHitLatencyMs: 0.1,
  avgMissLatencyMs: 155.8,
};

export function ValueSection() {
  return (
    <section id="value" className="demo-section">
      <p className="section-kicker">Pre-revenue value</p>
      <h2 className="section-title">Diligence-ready proof</h2>
      <p className="section-lead">
        No ARR yet — the asset is the runtime, the edge reference, and adapters shaped
        for Cloudflare, Vercel, and Node serverless. Measured hit path is orders of
        magnitude faster than cold miss in the included bench.
      </p>

      <div className="value-grid">
        <div className="value-stat">
          <span className="metric-label">Hit confirm (bench)</span>
          <div className="metric-value hit">~{SNAPSHOT.avgHitLatencyMs}ms</div>
        </div>
        <div className="value-stat">
          <span className="metric-label">Miss / cold path</span>
          <div className="metric-value miss">~{SNAPSHOT.avgMissLatencyMs}ms</div>
        </div>
        <div className="value-stat">
          <span className="metric-label">Approx speedup</span>
          <div className="metric-value hit">
            ~
            {Math.round(SNAPSHOT.avgMissLatencyMs / Math.max(SNAPSHOT.avgHitLatencyMs, 0.01))}
            ×
          </div>
        </div>
        <div className="value-stat">
          <span className="metric-label">Acquirer adapters</span>
          <div className="metric-value" style={{ fontSize: "1.35rem" }}>
            Workers · Vercel · Node
          </div>
        </div>
      </div>

      <ul className="acquire-list" style={{ marginTop: "2.5rem" }}>
        <li>
          <strong>Technical whitepaper</strong>
          <span>
            Model, safety (shadow/commit/compensate), predictor mesh —{" "}
            <code>docs/whitepaper.md</code>
          </span>
        </li>
        <li>
          <strong>Acquisition brief</strong>
          <span>
            Why buy pre-revenue, buyer fit matrix — <code>docs/ACQUISITION.md</code>
          </span>
        </li>
        <li>
          <strong>Audit bundle</strong>
          <span>
            <code>engine.exportAuditBundle()</code> — metrics, ledger, predictor, policy
            for data rooms
          </span>
        </li>
        <li>
          <strong>Threat model</strong>
          <span>
            Speculation risks and production checklist — <code>SECURITY.md</code>
          </span>
        </li>
      </ul>
    </section>
  );
}
