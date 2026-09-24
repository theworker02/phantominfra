import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PhantomEngine,
  applyCartSurfacePriors,
  createCartHandlers,
  DEFAULT_CART_STATE,
  type CartState,
} from "@phantominfra/runtime";
import { handleWithSpeculation, jsonResult } from "./gate.js";
import { createWorkersFetchHandler } from "./workers.js";

function engine() {
  const e = new PhantomEngine<CartState>({
    initialState: structuredClone(DEFAULT_CART_STATE),
    coldPathDelayMs: 20,
    minProbability: 0.05,
  });
  for (const [r, h] of Object.entries(createCartHandlers(0.3))) e.register(r, h);
  applyCartSurfacePriors((s, r, w) => e.predictor.setSurfacePrior(s, r, w));
  return e;
}

describe("adapters gate", () => {
  it("speculates then confirms with hit headers", async () => {
    const e = engine();
    const resolveRoute = () => "checkout.confirm";
    await handleWithSpeculation(
      new Request("http://x/checkout", {
        method: "POST",
        headers: { "x-phantom-speculate": "1", "x-phantom-surface": "checkout" },
      }),
      { engine: e, resolveRoute, resolveSurface: () => "checkout" },
    );

    const confirmed = await handleWithSpeculation(
      new Request("http://x/checkout", {
        method: "POST",
        headers: { "x-phantom-surface": "checkout" },
      }),
      { engine: e, resolveRoute, resolveSurface: () => "checkout", alwaysSpeculate: true },
    );
    assert.ok(!(confirmed instanceof Response));
    assert.equal(confirmed.hit, true);
    const res = jsonResult(confirmed);
    assert.equal(res.headers.get("x-phantom-hit"), "1");
  });

  it("workers handler returns phantom latency header", async () => {
    const e = engine();
    const fetchHandler = createWorkersFetchHandler({
      engine: e,
      resolveRoute: () => "checkout.quote",
      resolveSurface: () => "checkout",
      alwaysSpeculate: true,
    });
    const res = await fetchHandler(
      new Request("http://x/api", { method: "POST", body: "{}" }),
    );
    assert.equal(res.status, 200);
    assert.ok(res.headers.get("x-phantom-latency-ms") != null);
  });
});
