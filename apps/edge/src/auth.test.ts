import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { authorize } from "./auth.js";
import { mergePredictorModels, type PredictorModel } from "@phantominfra/runtime";

function req(url: string, headers: Record<string, string> = {}) {
  return new Request(url, { headers });
}

describe("authorize", () => {
  it("allows anon when ALLOW_ANON and no keys required match", () => {
    const r = authorize(req("http://x/"), { ALLOW_ANON: "true", API_KEYS: "" });
    assert.equal(r.ok, true);
    assert.equal(r.keyId, "anon");
  });

  it("accepts bearer matching API_KEYS", () => {
    const r = authorize(req("http://x/", { authorization: "Bearer secret" }), {
      ALLOW_ANON: "false",
      API_KEYS: "secret,other",
    });
    assert.equal(r.ok, true);
    assert.ok(r.keyId?.startsWith("key_"));
  });

  it("rejects missing key when anon disabled", () => {
    const r = authorize(req("http://x/"), {
      ALLOW_ANON: "false",
      API_KEYS: "secret",
    });
    assert.equal(r.ok, false);
    assert.equal(r.error, "missing_api_key");
  });

  it("rejects invalid key", () => {
    const r = authorize(req("http://x/", { authorization: "Bearer nope" }), {
      ALLOW_ANON: "false",
      API_KEYS: "secret",
    });
    assert.equal(r.ok, false);
    assert.equal(r.error, "invalid_api_key");
  });

  it("accepts api_key query param", () => {
    const r = authorize(req("http://x/?api_key=secret"), {
      ALLOW_ANON: "false",
      API_KEYS: "secret",
    });
    assert.equal(r.ok, true);
  });
});

describe("global model merge", () => {
  it("combines predictor deltas", () => {
    const a: PredictorModel = {
      transitions: { "cart.add": { "checkout.confirm": 2 } },
      surfacePriors: {},
      globalCounts: { "checkout.confirm": 2 },
      totalConfirms: 2,
    };
    const b: PredictorModel = {
      transitions: { "cart.add": { "checkout.quote": 1 } },
      surfacePriors: {},
      globalCounts: { "checkout.quote": 1 },
      totalConfirms: 1,
    };
    const m = mergePredictorModels(a, b);
    assert.equal(m.totalConfirms, 3);
    assert.equal(m.transitions["cart.add"]?.["checkout.confirm"], 2);
    assert.equal(m.transitions["cart.add"]?.["checkout.quote"], 1);
  });
});
