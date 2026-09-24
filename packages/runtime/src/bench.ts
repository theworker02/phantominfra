/**
 * Micro-benchmark: speculative hit vs cold-path miss latency.
 * Run: npm run bench -w @phantominfra/runtime
 */
import { PhantomEngine } from "./executor.js";
import {
  applyCartSurfacePriors,
  createCartHandlers,
  DEFAULT_CART_STATE,
  type CartState,
} from "./catalog/cart.js";

async function runRound(
  label: string,
  fn: () => Promise<{ hit: boolean; serverLatencyMs: number }>,
  rounds: number,
) {
  const samples: number[] = [];
  let hits = 0;
  for (let i = 0; i < rounds; i++) {
    const r = await fn();
    samples.push(r.serverLatencyMs);
    if (r.hit) hits += 1;
  }
  samples.sort((a, b) => a - b);
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  const p50 = samples[Math.floor(samples.length * 0.5)]!;
  const p95 = samples[Math.floor(samples.length * 0.95)]!;
  console.log(
    `${label.padEnd(28)} n=${rounds}  hitRate=${(hits / rounds).toFixed(2)}  avg=${avg.toFixed(2)}ms  p50=${p50.toFixed(2)}ms  p95=${p95.toFixed(2)}ms`,
  );
  return { avg, p50, p95, hitRate: hits / rounds };
}

function makeEngine(coldPathDelayMs: number) {
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
  applyCartSurfacePriors((s, r, w) => engine.predictor.setSurfacePrior(s, r, w));
  return engine;
}

async function main() {
  console.log("\nPhantomInfra bench — speculative hit vs cold miss\n");
  const rounds = 40;

  const hitStats = await runRound(
    "speculate→confirm HIT",
    async () => {
      const engine = makeEngine(120);
      await engine.speculate({
        contextKey: "bench",
        surface: "checkout",
        history: ["cart.add", "checkout.quote"],
      });
      return engine.confirm("checkout.confirm");
    },
    rounds,
  );

  const missStats = await runRound(
    "speculate→confirm MISS",
    async () => {
      const engine = makeEngine(120);
      await engine.speculate({
        contextKey: "bench",
        surface: "checkout",
      });
      return engine.confirm("support.ticket");
    },
    rounds,
  );

  const speedup = missStats.avg / Math.max(hitStats.avg, 0.001);
  console.log(`\nApprox hit speedup vs miss: ${speedup.toFixed(1)}×\n`);

  if (hitStats.avg > missStats.avg) {
    console.warn("Warning: hit path slower than miss — unexpected for this demo.");
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
