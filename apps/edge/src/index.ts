import {
  createRateLimitState,
  runHitMissProof,
  takeToken,
  type RateLimitState,
} from "@phantominfra/runtime";
import { authorize } from "./auth";
import { globalPredictorStats } from "./global-model";
import { openApiDocument } from "./openapi-doc";
import { PhantomSession } from "./session-do";

export { PhantomSession };

export interface Env {
  PHANTOM_SESSION: DurableObjectNamespace;
  PREDICTOR_KV: KVNamespace;
  API_KEYS?: string;
  ALLOW_ANON?: string;
}

interface SessionRpc {
  createSession(input?: { isolated?: boolean }): Promise<{ sessionId: string; state: unknown }>;
  speculate(input: {
    surface?: string;
    history?: string[];
  }): Promise<{
    branches: unknown[];
    events: unknown[];
    candidatesHint: string;
  }>;
  planAgent(input: { plan: unknown }): Promise<{
    branches: unknown[];
    events: unknown[];
    prediction: unknown;
    candidatesHint: string;
  }>;
  confirm(input: { route: string; payload?: unknown }): Promise<{
    hit: boolean;
    route: string;
    result: unknown;
    serverLatencyMs: number;
    branchId?: string;
    state: Record<string, unknown>;
    branches: unknown[];
    metrics: unknown;
    events: unknown[];
  }>;
  status(): Promise<{
    state: unknown;
    history: string[];
    branches: unknown[];
    metrics: unknown;
    events: unknown[];
    lastPlan?: unknown;
    globalConfirms?: number | null;
    ledger?: unknown;
    ledgerSummary?: unknown;
  }>;
  exportAudit(): Promise<unknown>;
}

const rateBuckets = new Map<string, RateLimitState>();
const RATE = { capacity: 60, refillPerSecond: 2 };

function defaultRouteForSurface(surface: string): string {
  switch (surface) {
    case "checkout":
      return "checkout.confirm";
    case "quote":
      return "checkout.quote";
    case "support":
      return "support.ticket";
    case "inventory":
      return "inventory.check";
    case "agent":
      return "tools.charge";
    case "search":
      return "tools.search";
    default:
      return "cart.add";
  }
}

const ROOT_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PhantomInfra</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Syne:wght@700;800&display=swap" rel="stylesheet" />
  <style>
    :root { --ink:#0c1420; --muted:#4a5a6a; --signal:#0d8f7a; --miss:#b45309; --bg:#e8eef3; --line:rgba(12,20,32,.12); --panel:rgba(255,255,255,.42); }
    * { box-sizing: border-box; }
    body { margin:0; min-height:100vh; font-family:"IBM Plex Mono",ui-monospace,monospace; color:var(--ink);
      background: radial-gradient(ellipse 90% 50% at 80% 0%, rgba(20,184,154,.14), transparent 55%), linear-gradient(165deg,var(--bg),#d5e0ea); }
    main { max-width: 44rem; padding: 3.25rem 1.5rem 3rem; }
    h1 { margin:0; font-family:Syne,sans-serif; font-size:clamp(2.6rem,9vw,4.6rem); font-weight:800; letter-spacing:-.04em; line-height:.95; }
    .tag { margin:.75rem 0 0; color:var(--signal); font-size:.7rem; letter-spacing:.14em; text-transform:uppercase; }
    .lede { color:var(--muted); font-size:.9rem; max-width:32rem; margin:1rem 0 0; line-height:1.45; }
    .label { margin:1.85rem 0 .65rem; font-size:.68rem; letter-spacing:.12em; text-transform:uppercase; color:var(--muted); }
    .cases { display:grid; grid-template-columns:repeat(auto-fill,minmax(12.5rem,1fr)); gap:.55rem; }
    .case {
      appearance:none; text-align:left; cursor:pointer; border:1px solid var(--line); background:var(--panel);
      padding:.85rem .9rem .95rem; color:var(--ink); font:inherit;
      transition:border-color .15s ease, background .15s ease, transform .15s ease;
    }
    .case:hover { transform:translateY(-1px); border-color:rgba(12,20,32,.28); }
    .case.on { background:var(--ink); color:var(--bg); border-color:transparent; }
    .case .name { font-family:Syne,sans-serif; font-weight:800; font-size:1.05rem; letter-spacing:-.02em; }
    .case .blurb { margin:.35rem 0 0; font-size:.7rem; line-height:1.4; opacity:.72; }
    .case .expect { margin:.55rem 0 0; font-size:.62rem; letter-spacing:.06em; text-transform:uppercase; opacity:.85; }
    .case.on .blurb, .case.on .expect { opacity:.78; }
    .row { display:flex; flex-wrap:wrap; gap:.45rem; margin-top:1.1rem; }
    button {
      appearance:none; border:1px solid var(--line); background:transparent; color:var(--ink);
      font:inherit; font-size:.72rem; letter-spacing:.05em; text-transform:uppercase;
      padding:.7rem 1rem; cursor:pointer; transition:background .15s ease, color .15s ease, transform .15s ease, border-color .15s ease;
    }
    button:hover { transform:translateY(-1px); }
    button.primary { background:var(--ink); color:var(--bg); border-color:transparent; }
    button.ghost { background:var(--panel); }
    button:disabled, .case:disabled { opacity:.5; cursor:wait; transform:none; }
    #branches { display:flex; flex-wrap:wrap; gap:.45rem; min-height:2.2rem; }
    #branches .chip {
      appearance:none; border:1px dashed var(--line); background:transparent; color:var(--ink);
      font:inherit; font-size:.72rem; letter-spacing:.04em; text-transform:uppercase;
      padding:.65rem .9rem; cursor:pointer;
    }
    #branches .chip:hover { border-style:solid; border-color:var(--ink); }
    #branches .chip .p { opacity:.65; margin-left:.35rem; font-size:.65rem; }
    #out {
      margin-top:1.35rem; padding:1.1rem 0 0; border-top:1px solid var(--line);
      font-size:.85rem; color:var(--muted); opacity:0; transform:translateY(6px);
      transition:opacity .35s ease, transform .35s ease;
    }
    #out.show { opacity:1; transform:none; }
    #out .big { font-family:Syne,sans-serif; font-size:1.55rem; font-weight:800; letter-spacing:-.03em; color:var(--ink); line-height:1.1; }
    #out .big.hit { color:var(--signal); }
    #out .big.miss { color:var(--miss); }
    #out .meta { margin-top:.5rem; line-height:1.55; }
    .compare {
      display:grid; grid-template-columns:1fr 1fr; gap:.75rem; margin-top:1rem;
    }
    .compare .col {
      padding:.9rem 0 0; border-top:1px solid var(--line); font-size:.8rem; color:var(--muted);
    }
    .compare .col .big { font-family:Syne,sans-serif; font-size:1.35rem; font-weight:800; letter-spacing:-.03em; line-height:1.1; }
    .compare .col .big.hit { color:var(--signal); }
    .compare .col .big.miss { color:var(--miss); }
    .speedup {
      margin-top:1rem; font-family:Syne,sans-serif; font-size:1.25rem; font-weight:800; color:var(--ink);
    }
    @media (max-width:540px) { .compare { grid-template-columns:1fr; } }
    code { font-size:.85em; color:var(--ink); }
    #log { margin-top:1.5rem; display:flex; flex-direction:column; gap:.35rem; }
    #log:empty { display:none; }
    .log-item {
      display:flex; flex-wrap:wrap; gap:.55rem .9rem; align-items:baseline;
      padding:.55rem 0; border-top:1px solid var(--line); font-size:.75rem; color:var(--muted);
      animation:rise .35s ease both;
    }
    .log-item .badge { font-weight:500; letter-spacing:.06em; text-transform:uppercase; }
    .log-item .badge.hit { color:var(--signal); }
    .log-item .badge.miss { color:var(--miss); }
    @keyframes rise { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:none; } }
    .sess { margin-top:1.25rem; font-size:.7rem; color:var(--muted); word-break:break-all; }
    .foot { margin-top:2.25rem; font-size:.72rem; color:var(--muted); line-height:1.6; }
    .foot a { color:var(--ink); }
  </style>
</head>
<body>
  <main>
    <p class="tag">Live edge · sticky session</p>
    <h1>PhantomInfra</h1>
    <p class="lede">Choose a case — we speculate that surface, open COW branches, then you confirm. Each case hits a different route near 0&nbsp;ms.</p>

    <div class="label">Cases</div>
    <div class="cases" id="cases" role="group" aria-label="Cases"></div>

    <div class="row">
      <button type="button" class="primary" id="speculate">Speculate</button>
      <button type="button" class="ghost" id="quick">Confirm top</button>
      <button type="button" class="ghost" id="miss">Force miss</button>
      <button type="button" class="ghost" id="proof">Prove it</button>
      <button type="button" class="ghost" id="tour">Tour all</button>
      <button type="button" class="ghost" id="reset">New session</button>
    </div>

    <div class="label">Predicted branches — click to confirm</div>
    <div id="branches"></div>

    <div id="out" aria-live="polite"></div>
    <div id="log" aria-label="Confirm history"></div>
    <p class="sess" id="sess"></p>
    <p class="foot">API: <a href="/health">/health</a> · <a href="/v1/proof">/v1/proof</a> · <a href="/v1/value">/v1/value</a> · <a href="/openapi.json">OpenAPI</a></p>
  </main>
  <script>
    const CASES = [
      { id: "browse", label: "Browse", blurb: "Shopper scanning SKUs", expect: "cart.add", miss: "support.ticket" },
      { id: "quote", label: "Quote", blurb: "Price check before buy", expect: "checkout.quote", miss: "support.ticket" },
      { id: "checkout", label: "Checkout", blurb: "Ready to place the order", expect: "checkout.confirm", miss: "support.ticket" },
      { id: "inventory", label: "Inventory", blurb: "Stock lookup at the edge", expect: "inventory.check", miss: "tools.charge" },
      { id: "support", label: "Support", blurb: "Help desk intake", expect: "support.ticket", miss: "cart.add" },
      { id: "agent", label: "Agent", blurb: "Tool-using agent plan", expect: "tools.charge", miss: "cart.add" },
      { id: "search", label: "Search", blurb: "Agent product search", expect: "tools.search", miss: "checkout.confirm" },
    ];
    const ALL_ROUTES = [
      "cart.add", "cart.remove", "inventory.check",
      "checkout.quote", "checkout.confirm",
      "support.ticket", "support.refund",
      "tools.search", "tools.quote", "tools.charge", "tools.notify", "tools.ticket",
    ];
    const state = { surface: "browse", sessionId: null, history: [], branches: [], busy: false };

    const el = {
      cases: document.getElementById("cases"),
      branches: document.getElementById("branches"),
      out: document.getElementById("out"),
      log: document.getElementById("log"),
      sess: document.getElementById("sess"),
      speculate: document.getElementById("speculate"),
      quick: document.getElementById("quick"),
      miss: document.getElementById("miss"),
      proof: document.getElementById("proof"),
      tour: document.getElementById("tour"),
      reset: document.getElementById("reset"),
    };

    function currentCase() {
      return CASES.find(function (c) { return c.id === state.surface; }) || CASES[0];
    }

    function setBusy(v) {
      state.busy = v;
      [el.speculate, el.quick, el.miss, el.proof, el.tour, el.reset].forEach(function (b) { b.disabled = v; });
      el.cases.querySelectorAll(".case").forEach(function (c) { c.disabled = v; });
    }

    function renderCases() {
      el.cases.innerHTML = "";
      CASES.forEach(function (c) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "case" + (state.surface === c.id ? " on" : "");
        b.innerHTML =
          '<div class="name">' + c.label + "</div>" +
          '<div class="blurb">' + c.blurb + "</div>" +
          '<div class="expect">Hit · ' + c.expect + "</div>";
        b.addEventListener("click", function () { selectCase(c.id); });
        el.cases.appendChild(b);
      });
    }

    async function selectCase(id) {
      if (state.busy) return;
      state.surface = id;
      state.branches = [];
      renderCases();
      renderBranches();
      await speculate();
    }

    function renderBranches() {
      el.branches.innerHTML = "";
      if (!state.branches.length) {
        el.branches.innerHTML = '<span style="color:var(--muted);font-size:.78rem">Select a case or speculate to open branches</span>';
        return;
      }
      state.branches.forEach(function (br) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "chip";
        var pct = Math.round((br.probability || 0) * 100);
        b.innerHTML = br.route + '<span class="p">' + pct + "%</span>";
        b.addEventListener("click", function () { confirmRoute(br.route, { skipSpeculate: true }); });
        el.branches.appendChild(b);
      });
    }

    function showOut(html) {
      if (!html) { el.out.classList.remove("show"); el.out.innerHTML = ""; return; }
      el.out.innerHTML = html;
      el.out.classList.add("show");
    }

    function pushLog(data) {
      var row = document.createElement("div");
      row.className = "log-item";
      var kind = data.hit ? "hit" : "miss";
      row.innerHTML =
        '<span class="badge ' + kind + '">' + (data.hit ? "HIT" : "MISS") + "</span>" +
        "<code>" + data.route + "</code>" +
        "<span>" + data.serverLatencyMs + "ms</span>" +
        "<span>" + (data.surface || state.surface) + "</span>";
      el.log.insertBefore(row, el.log.firstChild);
      while (el.log.children.length > 10) el.log.removeChild(el.log.lastChild);
    }

    function updateSess() {
      el.sess.textContent = state.sessionId
        ? "Session " + state.sessionId + " · history " + (state.history.join(" → ") || "—")
        : "No session yet";
    }

    async function api(path, body) {
      var res = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(body || {}),
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(data.error || res.statusText);
      return data;
    }

    async function ensureSession() {
      if (state.sessionId) return state.sessionId;
      var data = await api("/v1/demo", { action: "session" });
      state.sessionId = data.sessionId;
      updateSess();
      return state.sessionId;
    }

    async function speculate() {
      setBusy(true);
      try {
        await ensureSession();
        var data = await api("/v1/demo", {
          action: "speculate",
          sessionId: state.sessionId,
          surface: state.surface,
          history: state.history,
        });
        state.sessionId = data.sessionId;
        state.branches = data.branches || [];
        renderBranches();
        var c = currentCase();
        showOut(
          '<div class="big">Branches open</div><div class="meta"><code>' + c.label +
          "</code> — expecting <code>" + c.expect + "</code><br/>Predicted " +
          (data.predicted || "—") + "</div>"
        );
        updateSess();
      } catch (err) {
        showOut('<div class="big miss">Error</div><div class="meta">' + (err.message || err) + "</div>");
      } finally {
        setBusy(false);
      }
    }

    async function confirmRoute(route, opts) {
      opts = opts || {};
      setBusy(true);
      var t0 = performance.now();
      try {
        await ensureSession();
        if (!state.branches.length && !opts.skipSpeculate) {
          var pre = await api("/v1/demo", {
            action: "speculate",
            sessionId: state.sessionId,
            surface: state.surface,
            history: state.history,
          });
          state.branches = pre.branches || [];
          renderBranches();
        }
        var data = await api("/v1/demo", {
          action: "confirm",
          sessionId: state.sessionId,
          surface: state.surface,
          route: route,
          history: state.history,
          speculateFirst: false,
        });
        state.sessionId = data.sessionId;
        state.history = (state.history || []).concat([data.route]).slice(-8);
        state.branches = [];
        renderBranches();
        var wall = Math.round(performance.now() - t0);
        var kind = data.hit ? "hit" : "miss";
        showOut(
          '<div class="big ' + kind + '">' + (data.hit ? "HIT" : "MISS") +
          " · " + data.serverLatencyMs + "ms</div>" +
          '<div class="meta">Confirmed <code>' + data.route +
          "</code> · case <code>" + currentCase().label +
          "</code><br/>Wall " + wall + "ms · " + (data.tip || "") + "</div>"
        );
        pushLog({ hit: data.hit, route: data.route, serverLatencyMs: data.serverLatencyMs, surface: state.surface });
        updateSess();
      } catch (err) {
        showOut('<div class="big miss">Error</div><div class="meta">' + (err.message || err) + "</div>");
      } finally {
        setBusy(false);
      }
    }

    async function forceMiss() {
      var c = currentCase();
      var predicted = state.branches.map(function (b) { return b.route; });
      var pick = c.miss;
      if (predicted.indexOf(pick) !== -1) {
        pick = ALL_ROUTES.find(function (r) { return predicted.indexOf(r) === -1; }) || pick;
      }
      if (!state.branches.length) await speculate();
      await confirmRoute(pick, { skipSpeculate: true });
    }

    async function tour() {
      setBusy(true);
      try {
        state.sessionId = null;
        state.history = [];
        state.branches = [];
        for (var i = 0; i < CASES.length; i++) {
          state.surface = CASES[i].id;
          renderCases();
          var data = await api("/v1/demo", {
            action: "run",
            surface: state.surface,
            history: state.history,
            sessionId: state.sessionId,
          });
          state.sessionId = data.sessionId;
          state.history = (state.history || []).concat([data.route]).slice(-8);
          pushLog({ hit: data.hit, route: data.route, serverLatencyMs: data.serverLatencyMs, surface: state.surface });
          showOut(
            '<div class="big ' + (data.hit ? "hit" : "miss") + '">' +
            (data.hit ? "HIT" : "MISS") + " · " + data.serverLatencyMs + "ms</div>" +
            '<div class="meta">Tour ' + (i + 1) + "/" + CASES.length + " · <code>" + CASES[i].label +
            "</code> → <code>" + data.route + "</code></div>"
          );
          updateSess();
          await new Promise(function (r) { setTimeout(r, 380); });
        }
        var miss = await api("/v1/demo", {
          action: "run",
          surface: "browse",
          route: "support.ticket",
          history: state.history,
          sessionId: state.sessionId,
        });
        state.sessionId = miss.sessionId;
        state.history = (state.history || []).concat([miss.route]).slice(-8);
        pushLog({ hit: miss.hit, route: miss.route, serverLatencyMs: miss.serverLatencyMs, surface: "browse" });
        showOut(
          '<div class="big ' + (miss.hit ? "hit" : "miss") + '">' +
          (miss.hit ? "HIT" : "MISS") + " · " + miss.serverLatencyMs + "ms</div>" +
          '<div class="meta">Forced miss <code>' + miss.route + "</code> — cold path vs 0ms hits</div>"
        );
        updateSess();
        renderBranches();
      } catch (err) {
        showOut('<div class="big miss">Error</div><div class="meta">' + (err.message || err) + "</div>");
      } finally {
        setBusy(false);
      }
    }

    async function runProof() {
      setBusy(true);
      el.proof.textContent = "Proving…";
      try {
        var data = await api("/v1/demo", { action: "proof", rounds: 6 });
        showOut(
          '<div class="big">Live proof</div>' +
          '<div class="compare">' +
            '<div class="col"><div class="big hit">HIT · ' + data.hit.avgMs + 'ms</div>' +
            '<div class="meta"><code>' + data.hit.route + '</code> · p50 ' + data.hit.p50Ms +
            ' · p95 ' + data.hit.p95Ms + '</div></div>' +
            '<div class="col"><div class="big miss">MISS · ' + data.miss.avgMs + 'ms</div>' +
            '<div class="meta"><code>' + data.miss.route + '</code> · p50 ' + data.miss.p50Ms +
            ' · p95 ' + data.miss.p95Ms + '</div></div>' +
          '</div>' +
          '<div class="speedup">~' + data.speedup + '× faster on hit</div>' +
          '<div class="meta" style="margin-top:.55rem">' + (data.tip || '') +
          ' · ' + data.rounds + ' rounds each</div>'
        );
        pushLog({
          hit: true,
          route: "proof×" + data.speedup,
          serverLatencyMs: data.hit.avgMs,
          surface: "proof",
        });
      } catch (err) {
        showOut('<div class="big miss">Error</div><div class="meta">' + (err.message || err) + "</div>");
      } finally {
        el.proof.textContent = "Prove it";
        setBusy(false);
      }
    }

    el.speculate.addEventListener("click", speculate);
    el.quick.addEventListener("click", async function () {
      if (!state.branches.length) await speculate();
      var top = state.branches[0];
      if (top) await confirmRoute(top.route, { skipSpeculate: true });
    });
    el.miss.addEventListener("click", forceMiss);
    el.proof.addEventListener("click", runProof);
    el.tour.addEventListener("click", tour);
    el.reset.addEventListener("click", function () {
      state.sessionId = null;
      state.history = [];
      state.branches = [];
      renderBranches();
      showOut(null);
      updateSess();
    });

    renderCases();
    renderBranches();
    updateSess();
  </script>
</body>
</html>`;

function json(data: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, authorization",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      ...extraHeaders,
    },
  });
}

function cors(request: Request): Response | null {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "content-type, authorization",
        "access-control-allow-methods": "GET,POST,OPTIONS",
      },
    });
  }
  return null;
}

function sessionStub(env: Env, sessionId: string): SessionRpc {
  const id = env.PHANTOM_SESSION.idFromName(sessionId);
  return env.PHANTOM_SESSION.get(id) as unknown as SessionRpc;
}

function sessionDo(env: Env, sessionId: string): DurableObjectStub {
  const id = env.PHANTOM_SESSION.idFromName(sessionId);
  return env.PHANTOM_SESSION.get(id);
}

function checkRate(keyId: string): { ok: true; remaining: number } | { ok: false; retryAfterMs: number } {
  const now = Date.now();
  let state = rateBuckets.get(keyId) ?? createRateLimitState(RATE, now);
  const result = takeToken(state, RATE, now);
  rateBuckets.set(keyId, result.state);
  if (!result.allowed) {
    return { ok: false, retryAfterMs: result.retryAfterMs };
  }
  return { ok: true, remaining: result.remaining };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const preflight = cors(request);
    if (preflight) return preflight;

    const url = new URL(request.url);
    const { pathname } = url;

    try {
      if (request.method === "GET" && (pathname === "/" || pathname === "")) {
        const accept = request.headers.get("accept") ?? "";
        if (accept.includes("application/json") && !accept.includes("text/html")) {
          return json({
            service: "phantominfra-edge",
            phase: 5,
            tryIt: "Open / — pick a surface, speculate, confirm different routes",
            docs: {
              demo: "POST /v1/demo { action, surface, route, sessionId }",
              proof: "GET /v1/proof",
              value: "GET /v1/value",
              health: "/health",
              openapi: "/openapi.json",
              sessions: "POST /v1/sessions",
            },
            auth: {
              header: "Authorization: Bearer <key>",
              demoKey: "dev_phantom_key",
              note: "Anon allowed on this deployment; /v1/demo needs no key",
            },
          });
        }
        return new Response(ROOT_HTML, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "access-control-allow-origin": "*",
          },
        });
      }

      if (request.method === "GET" && pathname === "/health") {
        const stats = await globalPredictorStats(env.PREDICTOR_KV);
        return json({
          ok: true,
          service: "phantominfra-edge",
          phase: 5,
          globalPredictor: stats,
        });
      }

      if (request.method === "GET" && pathname === "/openapi.json") {
        return json(openApiDocument);
      }

      if (request.method === "GET" && pathname === "/v1/proof") {
        const rounds = Math.min(
          20,
          Math.max(1, Number(url.searchParams.get("rounds") ?? 6) || 6),
        );
        const proof = await runHitMissProof({ rounds, coldPathDelayMs: 120 });
        return json({ ok: true, ...proof });
      }

      if (request.method === "GET" && pathname === "/v1/value") {
        const stats = await globalPredictorStats(env.PREDICTOR_KV);
        const proof = await runHitMissProof({ rounds: 4, coldPathDelayMs: 120 });
        const savedPerHit = Math.max(0, proof.miss.avgMs - proof.hit.avgMs);
        const estHits = stats.totalConfirms ?? 0;
        const estimatedSavedMs = Number((estHits * savedPerHit).toFixed(2));
        const usdPerCpuHour = 0.5;
        const estimatedValueUsd = Number(
          ((estimatedSavedMs * usdPerCpuHour) / 3_600_000).toFixed(8),
        );
        return json({
          ok: true,
          generatedAt: new Date().toISOString(),
          version: "1.4.1",
          liveProof: {
            hitAvgMs: proof.hit.avgMs,
            missAvgMs: proof.miss.avgMs,
            speedup: proof.speedup,
          },
          mesh: stats,
          estimatedSavedMs,
          estimatedValueUsd,
          assumptions: {
            usdPerCpuHour,
            note: "Illustrative — mesh confirms × (miss−hit) from live proof.",
          },
        });
      }

      // Public playground API: session / speculate / confirm / one-shot run / proof.
      if (request.method === "POST" && pathname === "/v1/demo") {
        const body = (await request.json().catch(() => ({}))) as {
          action?: "session" | "speculate" | "confirm" | "run" | "proof";
          sessionId?: string;
          surface?: string;
          route?: string;
          history?: string[];
          rounds?: number;
          speculateFirst?: boolean;
        };
        const action = body.action ?? "run";

        if (action === "proof") {
          const rounds = Math.min(20, Math.max(1, Number(body.rounds ?? 6) || 6));
          const proof = await runHitMissProof({ rounds, coldPathDelayMs: 120 });
          return json({ ok: true, ...proof });
        }

        const surface = body.surface ?? "browse";
        const history = Array.isArray(body.history) ? body.history.slice(-8) : [];
        const isNewSession = !body.sessionId;
        const sessionId =
          body.sessionId ??
          `demo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
        const stub = sessionStub(env, sessionId);

        if (action === "session" || (isNewSession && action !== "confirm")) {
          await stub.createSession({ isolated: true });
        }

        if (action === "session") {
          return json({ ok: true, sessionId });
        }

        if (action === "speculate") {
          const speculated = await stub.speculate({ surface, history });
          return json({
            ok: true,
            sessionId,
            surface,
            predicted: speculated.candidatesHint,
            branches: speculated.branches,
          });
        }

        if (action === "confirm") {
          // Speculate in the same request so DO eviction cannot drop open branches.
          const speculated = await stub.speculate({ surface, history });
          const top = speculated.branches[0] as { route?: string } | undefined;
          const route = body.route ?? top?.route ?? defaultRouteForSurface(surface);
          const confirmed = await stub.confirm({ route });
          ctx.waitUntil(Promise.resolve());
          return json({
            ok: true,
            sessionId,
            surface,
            predicted: speculated.candidatesHint,
            branches: speculated.branches,
            hit: confirmed.hit,
            route: confirmed.route,
            serverLatencyMs: confirmed.serverLatencyMs,
            result: confirmed.result,
            tip: confirmed.hit
              ? "Pre-executed before the request — commit only."
              : "Cold path; predictor will learn from this miss.",
          });
        }

        // action === "run"
        const speculated = await stub.speculate({ surface, history });
        const top = speculated.branches[0] as { route?: string } | undefined;
        const route = body.route ?? top?.route ?? defaultRouteForSurface(surface);
        const confirmed = await stub.confirm({ route });
        ctx.waitUntil(Promise.resolve());
        return json({
          ok: true,
          sessionId,
          surface,
          predicted: speculated.candidatesHint,
          branches: speculated.branches,
          hit: confirmed.hit,
          route: confirmed.route,
          serverLatencyMs: confirmed.serverLatencyMs,
          result: confirmed.result,
          tip: confirmed.hit
            ? "Pre-executed before the request — commit only."
            : "Cold path; predictor will learn from this miss.",
        });
      }

      const auth = authorize(request, env);
      if (!auth.ok) {
        return json({ error: auth.error ?? "unauthorized" }, 401);
      }

      // SSE is exempt from tight JSON body parsing; still rate-limit
      const rate = checkRate(auth.keyId ?? "anon");
      if (!rate.ok) {
        return json(
          { error: "rate_limited", retryAfterMs: rate.retryAfterMs },
          429,
          { "retry-after": String(Math.ceil(rate.retryAfterMs / 1000)) },
        );
      }

      if (request.method === "GET" && pathname === "/v1/predictor") {
        const stats = await globalPredictorStats(env.PREDICTOR_KV);
        return json({
          keyId: auth.keyId,
          globalPredictor: stats,
          rateRemaining: rate.remaining,
        });
      }

      if (request.method === "POST" && pathname === "/v1/sessions") {
        const body = (await request.json().catch(() => ({}))) as {
          sessionId?: string;
        };
        const sessionId =
          body.sessionId ??
          `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        const stub = sessionStub(env, sessionId);
        const created = await stub.createSession();
        return json({ sessionId, state: created.state, keyId: auth.keyId });
      }

      const eventsMatch = pathname.match(/^\/v1\/sessions\/([^/]+)\/events$/);
      if (eventsMatch && request.method === "GET") {
        const sessionId = decodeURIComponent(eventsMatch[1]!);
        const stub = sessionDo(env, sessionId);
        return stub.fetch(new Request("https://phantom-session/events", request));
      }

      const agentPlanMatch = pathname.match(
        /^\/v1\/sessions\/([^/]+)\/agent\/plan$/,
      );
      if (agentPlanMatch && request.method === "POST") {
        const sessionId = decodeURIComponent(agentPlanMatch[1]!);
        const stub = sessionStub(env, sessionId);
        const body = (await request.json()) as { plan?: unknown };
        if (!body.plan) return json({ error: "plan required" }, 400);
        const result = await stub.planAgent({ plan: body.plan });
        return json({ sessionId, ...result });
      }

      const sessionMatch = pathname.match(
        /^\/v1\/sessions\/([^/]+)(?:\/(speculate|confirm|metrics|audit))?$/,
      );
      if (sessionMatch) {
        const sessionId = decodeURIComponent(sessionMatch[1]!);
        const action = sessionMatch[2];
        const stub = sessionStub(env, sessionId);

        if (request.method === "GET" && !action) {
          const status = await stub.status();
          return json({ sessionId, ...status });
        }

        if (request.method === "GET" && action === "metrics") {
          const status = await stub.status();
          return json({ sessionId, metrics: status.metrics });
        }

        if (request.method === "GET" && action === "audit") {
          const audit = await stub.exportAudit();
          return json({ sessionId, audit });
        }

        if (request.method === "POST" && action === "speculate") {
          const body = (await request.json()) as {
            surface?: string;
            history?: string[];
          };
          const result = await stub.speculate(body);
          return json({ sessionId, ...result });
        }

        if (request.method === "POST" && action === "confirm") {
          const body = (await request.json()) as {
            route: string;
            payload?: unknown;
          };
          if (!body.route) return json({ error: "route required" }, 400);
          const result = await stub.confirm(body);
          // Ensure waitUntil from DO confirm has a chance when RPC returns
          ctx.waitUntil(Promise.resolve());
          return json({ sessionId, ...result });
        }
      }

      return json({ error: "not found", path: pathname }, 404);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(JSON.stringify({ level: "error", message }));
      return json({ error: message }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
