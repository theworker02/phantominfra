/**
 * Live hit-vs-miss proof — same story as `npm run bench`, callable from the edge.
 */
import { PhantomEngine } from "./executor.js";
import {
  applyCartSurfacePriors,
  createCartHandlers,
  DEFAULT_CART_STATE,
  type CartState,
} from "./catalog/cart.js";
import { applyAgentSurfacePriors, createAgentToolHandlers } from "./catalog/agent.js";

export interface ProofSample {
  hit: boolean;
  route: string;
  serverLatencyMs: number;
}

export interface ProofReport {
  generatedAt: string;
  rounds: number;
  hit: {
    route: string;
    samples: number[];
    avgMs: number;
    p50Ms: number;
    p95Ms: number;
    hitRate: number;
  };
  miss: {
    route: string;
    samples: number[];
    avgMs: number;
    p50Ms: number;
    p95Ms: number;
    hitRate: number;
  };
  speedup: number;
  tip: string;
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx]!;
}

function summarize(samples: number[], hits: number) {
  const sorted = [...samples].sort((a, b) => a - b);
  const avg = samples.reduce((a, b) => a + b, 0) / (samples.length || 1);
  return {
    samples,
    avgMs: Number(avg.toFixed(2)),
    p50Ms: Number(percentile(sorted, 0.5).toFixed(2)),
    p95Ms: Number(percentile(sorted, 0.95).toFixed(2)),
    hitRate: Number((hits / (samples.length || 1)).toFixed(4)),
  };
}

function makeEngine(coldPathDelayMs: number): PhantomEngine<CartState> {
  const engine = new PhantomEngine<CartState>({
    initialState: structuredClone(DEFAULT_CART_STATE),
    topK: 2,
    minProbability: 0.05,
    coldPathDelayMs,
    branchTtlMs: 30_000,
    handlerTimeoutMs: 5_000,
  });
  for (const [route, handler] of Object.entries(createCartHandlers(0.5))) {
    engine.register(route, handler);
  }
  for (const [route, handler] of Object.entries(createAgentToolHandlers(0.5))) {
    engine.register(route, handler);
  }
  applyCartSurfacePriors((s, r, w) => engine.predictor.setSurfacePrior(s, r, w));
  applyAgentSurfacePriors((s, r, w) => engine.predictor.setSurfacePrior(s, r, w));
  return engine;
}

export async function runHitMissProof(options?: {
  rounds?: number;
  coldPathDelayMs?: number;
}): Promise<ProofReport> {
  const rounds = Math.max(1, Math.min(options?.rounds ?? 8, 40));
  const coldPathDelayMs = options?.coldPathDelayMs ?? 120;

  const hitSamples: number[] = [];
  let hitHits = 0;
  for (let i = 0; i < rounds; i++) {
    const engine = makeEngine(coldPathDelayMs);
    await engine.speculate({
      contextKey: "proof",
      surface: "checkout",
      history: ["cart.add", "checkout.quote"],
    });
    const r = await engine.confirm("checkout.confirm");
    hitSamples.push(r.serverLatencyMs);
    if (r.hit) hitHits += 1;
  }

  const missSamples: number[] = [];
  let missHits = 0;
  for (let i = 0; i < rounds; i++) {
    const engine = makeEngine(coldPathDelayMs);
    await engine.speculate({
      contextKey: "proof",
      surface: "checkout",
    });
    const r = await engine.confirm("support.ticket");
    missSamples.push(r.serverLatencyMs);
    if (r.hit) missHits += 1;
  }

  const hit = { route: "checkout.confirm", ...summarize(hitSamples, hitHits) };
  const miss = { route: "support.ticket", ...summarize(missSamples, missHits) };
  const speedup =
    hit.avgMs <= 0 ? miss.avgMs : Number((miss.avgMs / Math.max(hit.avgMs, 0.01)).toFixed(1));

  return {
    generatedAt: new Date().toISOString(),
    rounds,
    hit,
    miss,
    speedup,
    tip:
      speedup >= 10
        ? `Speculative hits are ~${speedup}× faster than cold misses in this demo.`
        : "Run more rounds or raise coldPathDelayMs to widen the gap.",
  };
}
