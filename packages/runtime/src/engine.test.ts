import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PhantomEngine } from "./executor.js";
import { predictFromAgentPlan, AGENT_TOOLS } from "./agent.js";
import {
  createAgentToolHandlers,
  applyAgentSurfacePriors,
} from "./catalog/agent.js";
import { DEFAULT_CART_STATE, type CartState } from "./catalog/cart.js";
import { RoutePredictor, mergePredictorModels } from "./predictor.js";
import { createRateLimitState, takeToken } from "./rate-limit.js";

interface State {
  counter: number;
  effects: string[];
}

describe("PhantomEngine", () => {
  it("commits speculative hit with near-zero confirm latency", async () => {
    const engine = new PhantomEngine<State>({
      initialState: { counter: 0, effects: [] },
      coldPathDelayMs: 50,
      minProbability: 0.01,
    });

    engine.register("inc", async (ctx) => {
      await new Promise((r) => setTimeout(r, 30));
      ctx.mutate((s) => {
        s.counter += 1;
      });
      await ctx.effect("log", async () => {
        ctx.state.effects.push("inc");
      });
      return { counter: ctx.state.counter };
    });
    engine.register("noop", async () => ({ ok: true }));
    engine.predictor.setSurfacePrior("main", "inc", 10);
    engine.predictor.setSurfacePrior("main", "noop", 1);

    await engine.speculate({ contextKey: "t1", surface: "main" });
    const result = await engine.confirm("inc");

    assert.equal(result.hit, true);
    assert.ok(result.serverLatencyMs < 20, `expected fast commit, got ${result.serverLatencyMs}ms`);
    assert.equal(result.state.counter, 1);
    assert.deepEqual(result.state.effects, ["inc"]);
    assert.equal(engine.getMetrics().hits, 1);
    assert.ok(engine.getMetrics().estimatedSavedMs >= 20);
  });

  it("rolls back miss and leaves production untouched by wrong branch", async () => {
    const engine = new PhantomEngine<State>({
      initialState: { counter: 0, effects: [] },
      coldPathDelayMs: 10,
      minProbability: 0.01,
      topK: 1,
    });

    engine.register("poison", async (ctx) => {
      ctx.mutate((s) => {
        s.counter = 999;
      });
      await ctx.effect("bad", async () => {
        ctx.state.effects.push("poison");
      });
      return { bad: true };
    });
    engine.register("safe", async (ctx) => {
      ctx.mutate((s) => {
        s.counter += 1;
      });
      return { ok: true };
    });
    engine.predictor.setSurfacePrior("main", "poison", 10);
    engine.predictor.setSurfacePrior("main", "safe", 1);

    await engine.speculate({ contextKey: "t2", surface: "main" });
    assert.equal(engine.listBranches().length, 1);
    assert.equal(engine.listBranches()[0]?.route, "poison");

    const result = await engine.confirm("safe");

    assert.equal(result.hit, false);
    assert.equal(result.state.counter, 1);
    assert.deepEqual(result.state.effects, []);
    assert.equal(engine.getMetrics().misses, 1);
  });

  it("round-trips durable snapshots", async () => {
    const engine = new PhantomEngine<State>({
      initialState: { counter: 0, effects: [] },
      coldPathDelayMs: 1,
      minProbability: 0.01,
    });
    engine.register("inc", async (ctx) => {
      ctx.mutate((s) => {
        s.counter += 1;
      });
      return { counter: ctx.state.counter };
    });
    engine.predictor.setSurfacePrior("main", "inc", 10);

    await engine.speculate({ contextKey: "snap", surface: "main" });
    await engine.confirm("inc");
    const snap = engine.exportSnapshot();

    const restored = new PhantomEngine<State>({
      initialState: { counter: 0, effects: [] },
      coldPathDelayMs: 1,
    });
    restored.register("inc", async (ctx) => {
      ctx.mutate((s) => {
        s.counter += 1;
      });
      return { counter: ctx.state.counter };
    });
    restored.importSnapshot(snap);

    assert.equal(restored.getState().counter, 1);
    assert.equal(restored.getMetrics().hits, 1);
    assert.deepEqual(restored.getHistory(), ["inc"]);
  });

  it("shadows external effects during speculate and applies on commit", async () => {
    const engine = new PhantomEngine<State>({
      initialState: { counter: 0, effects: [] },
      coldPathDelayMs: 1,
      minProbability: 0.01,
    });

    const events: string[] = [];
    engine.on((e) => events.push(e.type));

    engine.register("pay", async (ctx) => {
      await ctx.effect(
        "stripe",
        async () => {
          ctx.state.effects.push("live");
        },
        {
          shadow: async () => {
            ctx.mutate((s) => {
              s.effects.push("shadow");
            });
          },
        },
      );
      return { ok: true };
    });
    engine.predictor.setSurfacePrior("main", "pay", 10);

    await engine.speculate({ contextKey: "pay", surface: "main" });
    const branch = engine.listBranches()[0];
    assert.ok(branch?.shadowedEffects?.includes("stripe"));
    assert.ok(events.includes("effect_shadowed"));

    // Shadow mutated draft only — production still clean before confirm
    assert.deepEqual(engine.getState().effects, []);

    const result = await engine.confirm("pay");
    assert.equal(result.hit, true);
    assert.ok(events.includes("effect_committed"));
    assert.ok((result.state.effects as string[]).includes("shadow"));
    assert.ok((result.state.effects as string[]).includes("live"));
  });

  it("speculates agent plans into tool branches", async () => {
    const engine = new PhantomEngine<CartState>({
      initialState: structuredClone(DEFAULT_CART_STATE),
      coldPathDelayMs: 1,
      minProbability: 0.05,
      topK: 2,
    });
    for (const [route, handler] of Object.entries(createAgentToolHandlers())) {
      engine.register(route, handler);
    }
    applyAgentSurfacePriors((s, r, w) => engine.predictor.setSurfacePrior(s, r, w));

    const opened = await engine.speculatePlan(
      {
        goal: "Buy edge capacity",
        steps: [
          { tool: "tools.charge", confidence: 0.9 },
          { tool: "tools.notify", confidence: 0.5 },
        ],
      },
      AGENT_TOOLS,
    );

    assert.ok(opened.some((b) => b.route === "tools.charge"));
    const hit = await engine.confirm("tools.charge");
    assert.equal(hit.hit, true);
    assert.ok((hit.state.notes as string[]).some((n) => n.startsWith("stripe.")));
  });

  it("compensates earlier effects when a later commit effect fails", async () => {
    const engine = new PhantomEngine<State>({
      initialState: { counter: 0, effects: [] },
      coldPathDelayMs: 1,
      minProbability: 0.01,
    });
    const log: string[] = [];
    engine.on((e) => {
      if (e.type === "effect_compensated") log.push(e.label);
    });

    engine.register("pay", async (ctx) => {
      await ctx.effect(
        "ledger",
        async () => {
          ctx.state.effects.push("ledger");
        },
        {
          compensate: async () => {
            ctx.state.effects = ctx.state.effects.filter((x) => x !== "ledger");
          },
        },
      );
      await ctx.effect("boom", async () => {
        throw new Error("payment failed");
      });
      return { ok: true };
    });
    engine.predictor.setSurfacePrior("main", "pay", 10);

    await engine.speculate({ contextKey: "c", surface: "main" });
    await assert.rejects(() => engine.confirm("pay"));
    assert.ok(log.includes("ledger"));
    assert.equal(engine.getState().counter, 0);
    assert.deepEqual(engine.getState().effects, []);
  });

  it("respects speculation deny policy", async () => {
    const engine = new PhantomEngine<State>({
      initialState: { counter: 0, effects: [] },
      coldPathDelayMs: 1,
      minProbability: 0.01,
      topK: 2,
      policy: { denyRoutes: ["poison"] },
    });
    engine.register("poison", async () => ({ bad: true }));
    engine.register("safe", async (ctx) => {
      ctx.mutate((s) => {
        s.counter += 1;
      });
      return { ok: true };
    });
    engine.predictor.setSurfacePrior("main", "poison", 10);
    engine.predictor.setSurfacePrior("main", "safe", 8);

    const denied: string[] = [];
    engine.on((e) => {
      if (e.type === "policy_denied") denied.push(e.route);
    });

    await engine.speculate({ contextKey: "p", surface: "main" });
    assert.ok(denied.includes("poison"));
    assert.ok(engine.listBranches().every((b) => b.route !== "poison"));
  });

  it("times out slow handlers and records ledger shadows", async () => {
    const engine = new PhantomEngine<State>({
      initialState: { counter: 0, effects: [] },
      coldPathDelayMs: 1,
      minProbability: 0.01,
      handlerTimeoutMs: 30,
    });
    engine.register("slow", async (ctx) => {
      await ctx.effect(
        "x",
        async () => {},
        {
          shadow: async () => {
            ctx.mutate((s) => {
              s.effects.push("shadowed");
            });
          },
        },
      );
      await new Promise((r) => setTimeout(r, 200));
      return { ok: true };
    });
    engine.predictor.setSurfacePrior("main", "slow", 10);

    await engine.speculate({ contextKey: "to", surface: "main" });
    // Branch should not remain ready after timeout failure
    assert.equal(engine.listBranches().length, 0);
    assert.ok(engine.getLedger().some((e) => e.phase === "shadow" && e.ok));
  });
});

describe("predictFromAgentPlan", () => {
  it("scores free-text plans via aliases", () => {
    const pred = predictFromAgentPlan(
      { text: "Please charge the customer and send an email receipt" },
      AGENT_TOOLS,
      3,
    );
    assert.equal(pred.matchedFrom, "text");
    assert.ok(pred.candidates.some((c) => c.route === "tools.charge"));
    assert.ok(pred.candidates.some((c) => c.route === "tools.notify"));
  });
});

describe("mergePredictorModels", () => {
  it("adds counts across models", () => {
    const a = new RoutePredictor();
    a.observe(null, "checkout.confirm");
    a.observe("cart.add", "checkout.confirm");
    const b = new RoutePredictor();
    b.observe(null, "checkout.confirm");
    b.observe("cart.add", "support.ticket");

    const merged = mergePredictorModels(a.exportModel(), b.exportModel());
    assert.equal(merged.totalConfirms, 4);
    assert.ok((merged.globalCounts["checkout.confirm"] ?? 0) >= 2);
  });
});

describe("rate limit", () => {
  it("refills and rejects when empty", () => {
    const config = { capacity: 2, refillPerSecond: 1 };
    let state = createRateLimitState(config, 0);
    let r = takeToken(state, config, 0);
    assert.equal(r.allowed, true);
    state = r.state;
    r = takeToken(state, config, 0);
    assert.equal(r.allowed, true);
    state = r.state;
    r = takeToken(state, config, 0);
    assert.equal(r.allowed, false);
    assert.ok(r.retryAfterMs > 0);
  });
});

describe("audit bundle", () => {
  it("exports value report after hits", async () => {
    const engine = new PhantomEngine<State>({
      initialState: { counter: 0, effects: [] },
      coldPathDelayMs: 1,
      minProbability: 0.01,
    });
    engine.register("inc", async (ctx) => {
      ctx.mutate((s) => {
        s.counter += 1;
      });
      return { ok: true };
    });
    engine.predictor.setSurfacePrior("main", "inc", 10);
    await engine.speculate({ contextKey: "a", surface: "main" });
    await engine.confirm("inc");
    const audit = engine.exportAuditBundle();
    assert.equal(audit.version, 1);
    assert.equal(audit.value.metrics.hits, 1);
    assert.ok(audit.predictor.totalConfirms >= 1);
  });
});
