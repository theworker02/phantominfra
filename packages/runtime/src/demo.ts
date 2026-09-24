/**
 * CLI demo — checkout flow with speculative pre-execution.
 * Run: npm run demo -w @phantominfra/runtime
 */
import {
  PhantomEngine,
  applyCartSurfacePriors,
  createCartHandlers,
  DEFAULT_CART_STATE,
  type CartState,
  type SpeculativeEvent,
} from "./index.js";

const engine = new PhantomEngine<CartState>({
  initialState: structuredClone(DEFAULT_CART_STATE),
  topK: 2,
  minProbability: 0.1,
  coldPathDelayMs: 180,
});

engine.on((event: SpeculativeEvent) => {
  const tag = event.type.padEnd(14);
  console.log(`  · ${tag}`, JSON.stringify(event));
});

for (const [route, handler] of Object.entries(createCartHandlers())) {
  engine.register(route, handler);
}
applyCartSurfacePriors((surface, route, w) => {
  engine.predictor.setSurfacePrior(surface, route, w);
});

async function main() {
  console.log("\nPhantomInfra — speculative checkout demo\n");

  console.log("1) User hovers checkout → speculate");
  await engine.speculate({
    contextKey: "sess_demo",
    surface: "checkout",
    history: ["cart.add", "checkout.quote"],
  });
  console.log(
    "   branches:",
    engine
      .listBranches()
      .map((b) => `${b.route} (${b.status})`)
      .join(", "),
  );

  console.log("\n2) User confirms purchase → commit hit");
  const hit = await engine.confirm("checkout.confirm");
  console.log(`   hit=${hit.hit}  serverLatencyMs=${hit.serverLatencyMs}`);
  console.log("   state.orders:", hit.state.orders);
  console.log("   state.wallet:", hit.state.wallet);
  console.log("   metrics:", engine.getMetrics());

  console.log("\n3) New context — wrong prediction → rollback + cold path");
  await engine.speculate({
    contextKey: "sess_demo",
    surface: "checkout",
    history: ["checkout.confirm"],
  });
  const miss = await engine.confirm("support.ticket");
  console.log(`   hit=${miss.hit}  serverLatencyMs=${miss.serverLatencyMs}`);
  console.log("   metrics:", engine.getMetrics());
  console.log("\nDone.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
