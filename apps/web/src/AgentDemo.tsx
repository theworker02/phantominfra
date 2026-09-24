import { useMemo, useState } from "react";
import {
  AGENT_TOOLS,
  PhantomEngine,
  applyAgentSurfacePriors,
  createAgentToolHandlers,
  DEFAULT_CART_STATE,
  predictFromAgentPlan,
  type BranchSnapshot,
  type CartState,
  type MetricsSummary,
  type SpeculativeEvent,
} from "@phantominfra/runtime";

const PRESETS: { label: string; text: string; steps?: { tool: string; confidence: number }[] }[] =
  [
    {
      label: "Checkout agent",
      text: "Charge the cart and send an email receipt",
      steps: [
        { tool: "tools.charge", confidence: 0.85 },
        { tool: "tools.notify", confidence: 0.55 },
      ],
    },
    {
      label: "Research then buy",
      text: "Search for gpu capacity, quote the cart, then charge",
      steps: [
        { tool: "tools.search", confidence: 0.7 },
        { tool: "tools.quote", confidence: 0.65 },
        { tool: "tools.charge", confidence: 0.5 },
      ],
    },
    {
      label: "Support path",
      text: "Open a support ticket for billing help",
      steps: [{ tool: "tools.ticket", confidence: 0.9 }],
    },
  ];

function createAgentEngine() {
  const engine = new PhantomEngine<CartState>({
    initialState: structuredClone(DEFAULT_CART_STATE),
    topK: 2,
    minProbability: 0.05,
    coldPathDelayMs: 140,
    branchTtlMs: 12_000,
  });
  for (const [route, handler] of Object.entries(createAgentToolHandlers())) {
    engine.register(route, handler);
  }
  applyAgentSurfacePriors((s, r, w) => engine.predictor.setSurfacePrior(s, r, w));
  return engine;
}

export function AgentDemo() {
  const [engine] = useState(() => createAgentEngine());
  const [preset, setPreset] = useState(0);
  const [planText, setPlanText] = useState(PRESETS[0]!.text);
  const [useSteps, setUseSteps] = useState(true);
  const [branches, setBranches] = useState<BranchSnapshot[]>([]);
  const [events, setEvents] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [lastLatency, setLastLatency] = useState<number | null>(null);
  const [lastHit, setLastHit] = useState<boolean | null>(null);
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [stateJson, setStateJson] = useState(() =>
    JSON.stringify(DEFAULT_CART_STATE, null, 2),
  );

  const preview = useMemo(
    () =>
      predictFromAgentPlan(
        useSteps
          ? { text: planText, steps: PRESETS[preset]?.steps }
          : { text: planText },
        AGENT_TOOLS,
        3,
      ),
    [planText, preset, useSteps],
  );

  async function runPlan() {
    setBusy(true);
    setEvents([]);
    const off = engine.on((event: SpeculativeEvent) => {
      setEvents((prev) => [`${event.type}: ${summarize(event)}`, ...prev].slice(0, 40));
    });
    try {
      const plan = useSteps
        ? { goal: PRESETS[preset]?.label, text: planText, steps: PRESETS[preset]?.steps }
        : { goal: "free-text", text: planText };
      const opened = await engine.speculatePlan(plan, AGENT_TOOLS);
      setBranches([...opened]);
      setMetrics(engine.getMetrics());
    } finally {
      off();
      setBusy(false);
    }
  }

  async function confirmTool(route: string) {
    setBusy(true);
    const off = engine.on((event: SpeculativeEvent) => {
      setEvents((prev) => [`${event.type}: ${summarize(event)}`, ...prev].slice(0, 40));
    });
    try {
      const result = await engine.confirm(route);
      setLastHit(result.hit);
      setLastLatency(result.serverLatencyMs);
      setStateJson(JSON.stringify(result.state, null, 2));
      setMetrics(engine.getMetrics());
      setBranches(engine.listBranches());
    } finally {
      off();
      setBusy(false);
    }
  }

  return (
    <div className="demo-shell">
      <div className="demo-panel">
        <h3>Agent plan</h3>
        <div className="surface-row" role="group" aria-label="Presets">
          {PRESETS.map((p, i) => (
            <button
              key={p.label}
              type="button"
              className="chip"
              aria-pressed={preset === i}
              disabled={busy}
              onClick={() => {
                setPreset(i);
                setPlanText(p.text);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        <label className="plan-label">
          <span>Plan text</span>
          <textarea
            className="plan-input"
            rows={3}
            value={planText}
            disabled={busy}
            onChange={(e) => setPlanText(e.target.value)}
          />
        </label>

        <label className="check-row">
          <input
            type="checkbox"
            checked={useSteps}
            disabled={busy}
            onChange={(e) => setUseSteps(e.target.checked)}
          />
          Prefer structured steps when available
        </label>

        <p className="prediction-hint">
          Predicted:{" "}
          {preview.candidates.length
            ? preview.candidates.map((c) => `${c.route}(${c.probability})`).join(", ")
            : "none"}{" "}
          <span className="muted">via {preview.matchedFrom}</span>
        </p>

        <div className="cta-row" style={{ marginTop: "1rem" }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => runPlan()}
          >
            Speculate tools
          </button>
        </div>

        <div className="action-grid" style={{ marginTop: "1.25rem" }}>
          {AGENT_TOOLS.map((t) => (
            <button
              key={t.name}
              type="button"
              className="action-btn"
              disabled={busy}
              onClick={() => confirmTool(t.name)}
            >
              <span className="route">{t.name}</span>
              <span className="hint">confirm</span>
            </button>
          ))}
        </div>

        <div className="latency-readout">
          <div>
            <span className="metric-label">Server latency</span>
            <div
              className={`metric-value ${lastHit === true ? "hit" : lastHit === false ? "miss" : ""}`}
            >
              {lastLatency === null ? "—" : `${lastLatency.toFixed(1)}ms`}
            </div>
          </div>
          <div>
            <span className="metric-label">Outcome</span>
            <div
              className={`metric-value ${lastHit === true ? "hit" : lastHit === false ? "miss" : ""}`}
            >
              {lastHit === null ? "—" : lastHit ? "HIT" : "MISS"}
            </div>
          </div>
        </div>

        {metrics ? (
          <div className="metrics-strip">
            <span>hit rate {(metrics.hitRate * 100).toFixed(0)}%</span>
            <span>saved {metrics.estimatedSavedMs.toFixed(0)}ms</span>
            <span>
              {metrics.hits}H / {metrics.misses}M
            </span>
          </div>
        ) : null}
      </div>

      <div className="demo-panel">
        <h3>Shadowed tool branches</h3>
        {branches.length === 0 ? (
          <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--ink-muted)" }}>
            Run a plan to pre-execute tool candidates. Stripe/email stay shadowed until confirm.
          </p>
        ) : (
          <ul className="branch-list">
            {branches.map((b) => (
              <li key={b.id} className="branch-item">
                <span className="branch-route">{b.route}</span>
                <span className="branch-meta">p={b.probability.toFixed(2)}</span>
                <span className={`branch-status ${b.status}`}>
                  {b.status}
                  {b.shadowedEffects?.length
                    ? ` · shadow ${b.shadowedEffects.join(", ")}`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="event-log" aria-live="polite">
          {events.length === 0 ? (
            <div>Waiting for agent speculation…</div>
          ) : (
            events.map((line, i) => (
              <div key={`${i}-${line}`}>{line}</div>
            ))
          )}
        </div>

        <pre className="state-dump">{stateJson}</pre>
      </div>
    </div>
  );
}

function summarize(event: SpeculativeEvent): string {
  switch (event.type) {
    case "predicted":
      return event.candidates.map((c) => `${c.route}(${c.probability})`).join(", ");
    case "branch_opened":
      return `${event.route} p=${event.probability}`;
    case "pre_executed":
      return `${event.route} in ${event.durationMs}ms`;
    case "effect_shadowed":
      return `${event.label} on ${event.branchId}`;
    case "effect_committed":
      return `${event.label} on ${event.branchId}`;
    case "effect_compensated":
      return `${event.label} on ${event.branchId}`;
    case "policy_denied":
      return `${event.route} (${event.reason})`;
    case "handler_timeout":
      return `${event.route} @ ${event.timeoutMs}ms`;
    case "committed":
      return `${event.route} @ ${event.serverLatencyMs}ms`;
    case "rolled_back":
      return `${event.route} (${event.reason})`;
    case "cold_path":
      return `${event.route} ${event.durationMs}ms`;
    default: {
      const _exhaustive: never = event;
      return String(_exhaustive);
    }
  }
}
