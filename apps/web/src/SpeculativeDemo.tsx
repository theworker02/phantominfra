import { useCallback, useEffect, useRef, useState } from "react";
import {
  PhantomEngine,
  applyCartSurfacePriors,
  createCartHandlers,
  DEFAULT_CART_STATE,
  type BranchSnapshot,
  type CartState,
  type MetricsSummary,
  type SpeculativeEvent,
} from "@phantominfra/runtime";

type Surface = "browse" | "checkout" | "support";
type DemoMode = "local" | "edge";

const ROUTES: { route: string; label: string }[] = [
  { route: "cart.add", label: "Add to cart" },
  { route: "checkout.quote", label: "Get quote" },
  { route: "checkout.confirm", label: "Confirm order" },
  { route: "support.ticket", label: "Open ticket" },
];

const API_BASE = import.meta.env.VITE_EDGE_URL ?? "/api";
const EDGE_API_KEY = import.meta.env.VITE_EDGE_API_KEY ?? "dev_phantom_key";

function createLocalEngine() {
  const engine = new PhantomEngine<CartState>({
    initialState: structuredClone(DEFAULT_CART_STATE),
    topK: 2,
    minProbability: 0.08,
    coldPathDelayMs: 160,
    branchTtlMs: 12_000,
  });

  for (const [route, handler] of Object.entries(createCartHandlers())) {
    engine.register(route, handler);
  }
  applyCartSurfacePriors((surface, route, w) => {
    engine.predictor.setSurfacePrior(surface, route, w);
  });

  return engine;
}

async function edgeFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${EDGE_API_KEY}`,
      ...(init?.headers ?? {}),
    },
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `Edge request failed (${res.status})`);
  }
  return data;
}

export function SpeculativeDemo() {
  const [mode, setMode] = useState<DemoMode>("local");
  const [surface, setSurface] = useState<Surface>("checkout");
  const [branches, setBranches] = useState<BranchSnapshot[]>([]);
  const [events, setEvents] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [edgeAvailable, setEdgeAvailable] = useState<boolean | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lastLatency, setLastLatency] = useState<number | null>(null);
  const [lastHit, setLastHit] = useState<boolean | null>(null);
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stateJson, setStateJson] = useState(() =>
    JSON.stringify(DEFAULT_CART_STATE, null, 2),
  );

  const engineRef = useRef<PhantomEngine<CartState> | null>(null);
  if (!engineRef.current) engineRef.current = createLocalEngine();

  const pushEvents = useCallback((lines: string[]) => {
    setEvents((prev) => [...lines, ...prev].slice(0, 40));
  }, []);

  useEffect(() => {
    const engine = engineRef.current!;
    const off = engine.on((event: SpeculativeEvent) => {
      if (mode !== "local") return;
      pushEvents([`${event.type}: ${summarize(event)}`]);
      setBranches(engine.listBranches());
      setMetrics(engine.getMetrics());
    });
    return off;
  }, [mode, pushEvents]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await edgeFetch<{ ok: boolean }>("/health");
        if (!cancelled) setEdgeAvailable(true);
      } catch {
        if (!cancelled) setEdgeAvailable(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const ensureEdgeSession = useCallback(async () => {
    if (sessionId) return sessionId;
    const created = await edgeFetch<{ sessionId: string; state: CartState }>(
      "/v1/sessions",
      { method: "POST", body: "{}" },
    );
    setSessionId(created.sessionId);
    setStateJson(JSON.stringify(created.state, null, 2));
    return created.sessionId;
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBusy(true);
      setError(null);
      try {
        if (mode === "local") {
          const engine = engineRef.current!;
          await engine.speculate({ contextKey: "live-demo", surface });
          if (!cancelled) {
            setBranches(engine.listBranches());
            setMetrics(engine.getMetrics());
          }
        } else {
          const id = await ensureEdgeSession();
          const result = await edgeFetch<{
            branches: BranchSnapshot[];
            events: SpeculativeEvent[];
          }>(`/v1/sessions/${id}/speculate`, {
            method: "POST",
            body: JSON.stringify({ surface }),
          });
          if (!cancelled) {
            setBranches(result.branches);
            pushEvents(result.events.map((e) => `${e.type}: ${summarize(e)}`));
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, surface, ensureEdgeSession, pushEvents]);

  async function onConfirm(route: string) {
    setBusy(true);
    setError(null);
    try {
      if (mode === "local") {
        const engine = engineRef.current!;
        const result = await engine.confirm(route);
        setLastHit(result.hit);
        setLastLatency(result.serverLatencyMs);
        setStateJson(JSON.stringify(result.state, null, 2));
        setMetrics(engine.getMetrics());
        await engine.speculate({ contextKey: "live-demo", surface });
        setBranches(engine.listBranches());
      } else {
        const id = await ensureEdgeSession();
        const result = await edgeFetch<{
          hit: boolean;
          serverLatencyMs: number;
          state: Record<string, unknown>;
          branches: BranchSnapshot[];
          metrics: MetricsSummary;
          events: SpeculativeEvent[];
        }>(`/v1/sessions/${id}/confirm`, {
          method: "POST",
          body: JSON.stringify({ route }),
        });
        setLastHit(result.hit);
        setLastLatency(result.serverLatencyMs);
        setStateJson(JSON.stringify(result.state, null, 2));
        setMetrics(result.metrics);
        pushEvents(result.events.map((e) => `${e.type}: ${summarize(e)}`));

        const speculated = await edgeFetch<{
          branches: BranchSnapshot[];
          events: SpeculativeEvent[];
        }>(`/v1/sessions/${id}/speculate`, {
          method: "POST",
          body: JSON.stringify({ surface }),
        });
        setBranches(speculated.branches);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function switchMode(next: DemoMode) {
    if (next === "edge" && edgeAvailable === false) return;
    setMode(next);
    setEvents([]);
    setLastHit(null);
    setLastLatency(null);
    if (next === "edge") {
      setSessionId(null);
    } else {
      engineRef.current = createLocalEngine();
      setStateJson(JSON.stringify(engineRef.current.getState(), null, 2));
      setMetrics(engineRef.current.getMetrics());
    }
  }

  return (
    <div className="demo-shell">
      <div className="demo-panel">
        <h3>Interaction context</h3>

        <div className="surface-row" role="group" aria-label="Runtime">
          <button
            type="button"
            className="chip"
            aria-pressed={mode === "local"}
            onClick={() => switchMode("local")}
            disabled={busy}
          >
            Local runtime
          </button>
          <button
            type="button"
            className="chip"
            aria-pressed={mode === "edge"}
            onClick={() => switchMode("edge")}
            disabled={busy || edgeAvailable === false}
            title={
              edgeAvailable === false
                ? "Start the edge Worker: npm run dev:edge"
                : "Cloudflare Durable Object session"
            }
          >
            Edge Worker{edgeAvailable === false ? " (offline)" : ""}
          </button>
        </div>

        {mode === "edge" && sessionId ? (
          <p className="session-id">session {sessionId}</p>
        ) : null}

        <div className="surface-row" role="group" aria-label="Surface">
          {(["browse", "checkout", "support"] as Surface[]).map((s) => (
            <button
              key={s}
              type="button"
              className="chip"
              aria-pressed={surface === s}
              onClick={() => setSurface(s)}
              disabled={busy}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="action-grid">
          {ROUTES.map(({ route, label }) => (
            <button
              key={route}
              type="button"
              className="action-btn"
              disabled={busy}
              onClick={() => onConfirm(route)}
            >
              <span className="route">{label}</span>
              <span className="hint">{route}</span>
            </button>
          ))}
        </div>

        {error ? <p className="demo-error">{error}</p> : null}

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
        <h3>Live branches</h3>
        {branches.length === 0 ? (
          <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--ink-muted)" }}>
            No open speculative branches.
          </p>
        ) : (
          <ul className="branch-list">
            {branches.map((b) => (
              <li key={b.id} className="branch-item">
                <span className="branch-route">{b.route}</span>
                <span className="branch-meta">p={b.probability.toFixed(2)}</span>
                <span className={`branch-status ${b.status}`}>{b.status}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="event-log" aria-live="polite">
          {events.length === 0 ? (
            <div>Waiting for speculation…</div>
          ) : (
            events.map((line, i) => {
              const [type, rest] = line.split(": ");
              return (
                <div key={`${i}-${line}`}>
                  <span className="ev-type">{type}</span>
                  {rest ? ` — ${rest}` : ""}
                </div>
              );
            })
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
