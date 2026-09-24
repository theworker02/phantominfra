import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runHitMissProof } from "./proof.js";

describe("runHitMissProof", () => {
  it("shows hits faster than misses", async () => {
    const report = await runHitMissProof({ rounds: 3, coldPathDelayMs: 80 });
    assert.equal(report.rounds, 3);
    assert.ok(report.hit.hitRate >= 0.9);
    assert.ok(report.miss.hitRate <= 0.1);
    assert.ok(report.miss.avgMs > report.hit.avgMs);
    assert.ok(report.speedup >= 2);
  });
});
