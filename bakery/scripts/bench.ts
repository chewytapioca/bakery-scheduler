// Compare policies across many seeded days:  npm run bench [-- nSeeds]
import { POLICIES, makeScenario, runPolicy } from "../lib/engine";

const n = Number(process.argv[2] ?? 20);
const agg: Record<string, Record<string, number>> = {};
const keys = ["onTimePct", "avgLatenessMin", "ordersCancelled", "throughputUnitsPerHr", "workerUtilPct", "ovenUtilPct", "ovenIdleWithWorkMin", "ovenFillPct", "changeovers", "wasteCost", "overproofs", "shortageLotMinutes"] as const;
for (let seed = 1; seed <= n; seed++) {
  const sc = makeScenario(seed);
  for (const p of POLICIES) {
    const r = runPolicy(p.id, sc);
    agg[p.id] ??= {};
    for (const k of keys) agg[p.id][k] = (agg[p.id][k] ?? 0) + (r[k] as number) / n;
  }
}
console.log(`mean over ${n} seeded days`);
console.table(Object.fromEntries(Object.entries(agg).map(([p, v]) => [p, Object.fromEntries(Object.entries(v).map(([k, x]) => [k, +x.toFixed(1)]))])));
