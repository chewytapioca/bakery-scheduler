// Invariant checks over many simulated days:  npm test
import assert from "node:assert/strict";
import { POLICIES, createSim, makeScenario, step, summarize, coolRackUse, doughRackUse } from "../lib/engine";

let checks = 0;
for (let seed = 1; seed <= 25; seed++) {
  for (const p of POLICIES) {
    const sc = makeScenario(seed);
    const s = createSim(structuredClone(sc), p.id);
    while (!s.finished) {
      step(s);
      const t = s.now - 1;
      // resources never double-booked
      for (const o of s.ovens) {
        const trays = o.lotIds.reduce((a, id) => a + s.lots[id].trays, 0);
        assert.ok(trays <= o.capacity, `oven ${o.id} over capacity`);
        const temps = new Set(o.lotIds.map((id) => sc.recipes.find((r) => r.id === s.lots[id].product)!.bakeTemp));
        assert.ok(temps.size <= 1, "mixed temperatures in one batch");
        if (o.status === "baking") assert.ok(!o.maintenance.some((m) => t >= m.start && t < m.end), "baking during maintenance");
      }
      for (const w of s.workers) if (w.lotId) {
        assert.equal(s.lots[w.lotId].workerId, w.id);
        assert.ok(t >= w.shift[0] && t < w.shift[1], `${w.id} working off shift`);
        assert.ok(w.outUntil <= t, `${w.id} working while out`);
      }
      const busyStations = s.stations.filter((x) => x.lotId).map((x) => x.lotId);
      assert.equal(new Set(busyStations).size, busyStations.length, "lot on two stations");
      assert.ok(doughRackUse(s) <= sc.doughRackTrays, "dough rack overflow");
      assert.ok(coolRackUse(s) <= sc.coolRackTrays, "cool rack overflow");
      for (const v of Object.values(s.inventory)) assert.ok(v >= -1e-6, "negative inventory");
      checks++;
    }
    // every order ends in a terminal state; completions respect precedence
    for (const o of Object.values(s.orders)) {
      assert.ok(["done", "late", "cancelled"].includes(o.status), `order ${o.id} left ${o.status}`);
      if (o.completedAt != null) assert.ok(o.completedAt >= o.releaseAt);
    }
    const m = summarize(s);
    assert.ok(m.onTimePct >= 0 && m.onTimePct <= 100);
  }
}
console.log(`✓ ${checks} simulated minutes checked across 25 days × ${POLICIES.length} policies`);
