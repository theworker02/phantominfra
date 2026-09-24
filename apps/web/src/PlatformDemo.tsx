import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_EDGE_URL ?? "/api";
const DEFAULT_KEY = "dev_phantom_key";

export function PlatformDemo() {
  const [apiKey, setApiKey] = useState(DEFAULT_KEY);
  const [health, setHealth] = useState<string>("—");
  const [predictor, setPredictor] = useState<string>("—");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [streamLog, setStreamLog] = useState<string[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abortHandle, setAbortHandle] = useState<{ abort: () => void } | null>(
    null,
  );

  useEffect(() => {
    return () => abortHandle?.abort();
  }, [abortHandle]);

  async function refresh() {
    setError(null);
    try {
      const h = await fetch(`${API_BASE}/health`).then((r) => r.json());
      setHealth(JSON.stringify(h, null, 2));
      const p = await fetch(`${API_BASE}/v1/predictor`, {
        headers: { authorization: `Bearer ${apiKey}` },
      }).then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? r.statusText);
        return body;
      });
      setPredictor(JSON.stringify(p, null, 2));
      await fetch(`${API_BASE}/openapi.json`).then((r) => {
        if (!r.ok) throw new Error("openapi unavailable");
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function createAndStream() {
    setError(null);
    abortHandle?.abort();
    try {
      const created = await fetch(`${API_BASE}/v1/sessions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: "{}",
      }).then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? r.statusText);
        return body as { sessionId: string };
      });
      setSessionId(created.sessionId);
      setStreamLog([]);
      setStreaming(true);

      const url = new URL(
        `${window.location.origin}${API_BASE}/v1/sessions/${created.sessionId}/events`,
      );
      url.searchParams.set("api_key", apiKey);

      const controller = new AbortController();
      setAbortHandle({ abort: () => controller.abort() });

      const res = await fetch(url.toString(), {
        headers: { authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(`SSE failed (${res.status})`);

      // Kick a speculation so the stream has something to show
      void fetch(`${API_BASE}/v1/sessions/${created.sessionId}/speculate`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ surface: "checkout" }),
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          setStreamLog((prev) => [line.slice(6), ...prev].slice(0, 30));
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStreaming(false);
    }
  }

  function stopStream() {
    abortHandle?.abort();
    setStreaming(false);
  }

  return (
    <div className="demo-shell">
      <div className="demo-panel">
        <h3>Platform controls</h3>
        <label className="plan-label">
          <span>API key</span>
          <input
            className="plan-input"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            spellCheck={false}
          />
        </label>
        <div className="cta-row">
          <button type="button" className="btn btn-ghost" onClick={() => refresh()}>
            Refresh health
          </button>
          <a className="btn btn-ghost" href={`${API_BASE}/openapi.json`} target="_blank" rel="noreferrer">
            OpenAPI
          </a>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => (streaming ? stopStream() : createAndStream())}
          >
            {streaming ? "Stop SSE" : "Session + SSE"}
          </button>
        </div>
        {sessionId ? <p className="session-id">session {sessionId}</p> : null}
        {error ? <p className="demo-error">{error}</p> : null}
        <pre className="state-dump">{health}</pre>
        <pre className="state-dump">{predictor}</pre>
      </div>

      <div className="demo-panel">
        <h3>Live event stream</h3>
        <p style={{ margin: "0 0 1rem", fontSize: "0.8rem", color: "var(--ink-muted)" }}>
          Auth, token-bucket rate limits, KV global predictor mesh, and SSE from the
          session Durable Object.
        </p>
        <div className="event-log" aria-live="polite">
          {streamLog.length === 0 ? (
            <div>No events yet — start a stream.</div>
          ) : (
            streamLog.map((line, i) => <div key={`${i}-${line}`}>{line}</div>)
          )}
        </div>
      </div>
    </div>
  );
}
