/**
 * Discrete-time (1 minute) bakery production simulator + dispatcher.
 *
 * Each tick:
 *   1. fire scheduled events (order arrivals, deliveries, breakdowns, absences)
 *   2. complete finished activities (worker tasks, resting, baking, cooling)
 *   3. enforce constraints (over-proofed dough, customer patience)
 *   4. dispatch: assign worker/station tasks, then form oven batches
 *   5. accumulate metrics
 *
 * Three policies share the same mechanics and differ only in *decisions*:
 *   fifo  – first come, first served everywhere, first free resource
 *   edf   – earliest deadline first, greedy batching
 *   smart – least-slack-first with dough-proof urgency, ingredient reservation,
 *           temperature-aware batch scoring, and "hold for a fuller batch" lookahead
 */
import { SKILL_FOR, STATION_FOR } from "./catalog";
import type {
  IngredientId, Interval, Lot, Order, OvenState, PolicyId, Recipe, Scenario, ScenarioEvent,
  SimState, Stage, Summary, WorkerState,
} from "./types";

const LOG_CAP = 400;

export function createSim(scenario: Scenario, policy: PolicyId): SimState {
  const zero = (ids: string[]) => Object.fromEntries(ids.map((i) => [i, 0]));
  const wIds = scenario.workers.map((w) => w.id);
  const oIds = scenario.ovens.map((o) => o.id);
  const pending: ScenarioEvent[] = [
    ...scenario.events,
    ...scenario.orders.map((o) => ({ at: o.releaseAt, kind: "order" as const, order: o })),
  ].sort((a, b) => a.at - b.at);
  return {
    scenario, policy, now: 0, lots: {}, lotOrder: [], orders: {}, orderOrder: [],
    workers: scenario.workers.map((w) => ({ ...w, lotId: null, stationId: null, busyUntil: 0, outUntil: -1 })),
    stations: scenario.stations.map((s) => ({ ...s, lotId: null })),
    ovens: scenario.ovens.map((o) => ({
      ...o, temp: o.startTemp, targetTemp: null, status: "idle", lotIds: [], brokenUntil: -1,
      batchStartedAt: null, heatFrom: o.startTemp, heatStart: 0, heatDoneAt: 0,
    })),
    inventory: { ...scenario.inventory }, pending, intervals: [], waste: [], log: [], seq: 0, finished: false,
    c: {
      workerBusy: zero(wIds), workerIdle: zero(wIds),
      ovenBake: zero(oIds), ovenHeat: zero(oIds), ovenIdle: zero(oIds), ovenIdleWithWork: zero(oIds),
      ovenBlocked: zero(oIds), ovenDown: zero(oIds), ovenTrayMinutes: zero(oIds), ovenCapMinutes: zero(oIds),
      stationBusy: zero(scenario.stations.map((s) => s.id)),
      changeovers: 0, batches: 0, shortageLotMinutes: 0, overproofs: 0, wasteByIngredient: {}, series: [],
    },
  };
}

// ---------------------------------------------------------------- helpers

export const recipeOf = (s: SimState, id: string): Recipe => s.scenario.recipes.find((r) => r.id === id)!;
const log = (s: SimState, level: "info" | "warn" | "bad" | "good", msg: string) => {
  s.log.push({ t: s.now, level, msg });
  if (s.log.length > LOG_CAP) s.log.splice(0, s.log.length - LOG_CAP);
};
const lotsWhere = (s: SimState, f: (l: Lot) => boolean) => s.lotOrder.map((id) => s.lots[id]).filter(f);
const label = (s: SimState, l: Lot) => `${recipeOf(s, l.product).name} ×${l.units}`;

export function stageDuration(rec: Recipe, stage: Stage, trays: number, speed = 1): number {
  switch (stage) {
    case "mix": return Math.ceil((rec.mixBase + rec.mixPerTray * trays) / speed);
    case "rest": return rec.restMin;
    case "shape": return Math.ceil((rec.shapePerTray * trays) / speed);
    case "bake": return rec.bakeMin;
    case "cool": return rec.coolMin;
    case "finish": return Math.ceil((rec.finishPerTray * trays) / speed);
    default: return 0;
  }
}
const PIPE: Stage[] = ["mix", "rest", "shape", "bake", "cool", "finish"];

/** Nominal minutes of work left for a lot (used for slack). */
export function remainingWork(s: SimState, l: Lot): number {
  const rec = recipeOf(s, l.product);
  const i = PIPE.indexOf(l.stage);
  if (i < 0) return 0;
  let m = 0;
  for (let k = i; k < PIPE.length; k++) {
    if (k === i && l.running && l.endsAt != null) m += Math.max(0, l.endsAt - s.now);
    else m += stageDuration(rec, PIPE[k], l.trays);
  }
  return m;
}
export function lotSlack(s: SimState, l: Lot): number {
  return s.orders[l.orderId].deadline - s.now - remainingWork(s, l);
}
/** Minutes until this dough over-proofs (Infinity if not at risk). */
export function proofSlack(s: SimState, l: Lot): number {
  if (l.restEnd == null || l.ovenId || !(l.stage === "shape" || l.stage === "bake")) return Infinity;
  const rec = recipeOf(s, l.product);
  const shapeLeft = l.stage === "shape" ? stageDuration(rec, "shape", l.trays) : 0;
  return l.restEnd + rec.proofWindow - s.now - shapeLeft;
}

/** Trays of raw dough that need a rack slot: in the mixer, resting, shaping, or waiting for/at a pre-heating oven. */
export const doughRackUse = (s: SimState) =>
  lotsWhere(s, (l) => (l.stage === "mix" && l.running) || l.stage === "rest" || l.stage === "shape" ||
    (l.stage === "bake" && (!l.ovenId || s.ovens.find((o) => o.id === l.ovenId)!.status === "heating")))
    .reduce((a, l) => a + l.trays, 0);
export const coolRackUse = (s: SimState) =>
  lotsWhere(s, (l) => l.stage === "cool" || (l.stage === "finish" && !l.running)).reduce((a, l) => a + l.trays, 0);

function needs(rec: Recipe, units: number): [IngredientId, number][] {
  return Object.entries(rec.ingredientsPerUnit).map(([k, v]) => [k as IngredientId, v! * units]);
}
function lotCost(s: SimState, l: Lot): number {
  const rec = recipeOf(s, l.product);
  return needs(rec, l.units).reduce((a, [k, q]) => a + q * s.scenario.ingredients.find((i) => i.id === k)!.costPerUnit, 0);
}
function inMaintenance(o: OvenState, t: number) {
  return o.maintenance.some((m) => t >= m.start && t < m.end);
}
function nextMaintenance(o: OvenState, t: number) {
  return o.maintenance.filter((m) => m.end > t).reduce((a, m) => Math.min(a, m.start), Infinity);
}
function heatMinutes(o: OvenState, target: number) {
  const d = target - o.temp;
  if (d === 0) return 0;
  return Math.ceil(Math.abs(d) / (d > 0 ? o.heatRate : o.coolRate));
}
function truncate(s: SimState, resource: string, lotId: string | null, kind: Interval["kind"]) {
  for (let i = s.intervals.length - 1; i >= 0; i--) {
    const iv = s.intervals[i];
    if (iv.resource === resource && (lotId == null || iv.lotId === lotId) && iv.end > s.now) {
      iv.end = Math.max(iv.start, s.now);
      iv.kind = kind;
    }
  }
}

// ---------------------------------------------------------------- waste / scrap

function wasteLot(s: SimState, l: Lot, reason: "overproof" | "breakdown" | "cancelled") {
  if (!l.consumed) return;
  const rec = recipeOf(s, l.product);
  for (const [k, q] of needs(rec, l.units)) s.c.wasteByIngredient[k] = (s.c.wasteByIngredient[k] ?? 0) + q;
  s.waste.push({ t: s.now, reason, product: l.product, units: l.units, cost: lotCost(s, l), lotId: l.id });
}

/** Detach a lot from any worker/station/oven it's using. */
function release(s: SimState, l: Lot, kind: Interval["kind"]) {
  if (l.workerId) {
    const w = s.workers.find((w) => w.id === l.workerId)!;
    truncate(s, w.id, l.id, kind);
    w.lotId = null; w.stationId = null; w.busyUntil = s.now;
  }
  if (l.stationId) {
    const st = s.stations.find((x) => x.id === l.stationId)!;
    truncate(s, st.id, l.id, kind);
    st.lotId = null;
  }
  if (l.ovenId) {
    const o = s.ovens.find((x) => x.id === l.ovenId)!;
    o.lotIds = o.lotIds.filter((id) => id !== l.id);
    if (o.lotIds.length === 0) { truncate(s, o.id, null, kind); o.status = "idle"; o.batchStartedAt = null; o.targetTemp = null; }
  }
  l.workerId = l.stationId = l.ovenId = null;
  l.running = false; l.endsAt = null; l.bakedInOven = false;
}

/** Ruined dough/bake: throw it out and restart the lot from mixing. */
function restartLot(s: SimState, l: Lot, reason: "overproof" | "breakdown") {
  release(s, l, "ruined");
  wasteLot(s, l, reason);
  l.stage = "mix"; l.consumed = false; l.restEnd = null; l.attempts++; l.since = s.now;
  if (reason === "overproof") s.c.overproofs++;
}

// ---------------------------------------------------------------- events

function addOrder(s: SimState, def: import("./types").OrderDef) {
  const rec = recipeOf(s, def.product);
  const order: Order = { ...def, status: "queued", completedAt: null, lotIds: [] };
  let unitsLeft = def.qty;
  let traysLeft = Math.ceil(def.qty / rec.perTray);
  let k = 0;
  while (traysLeft > 0) {
    const trays = Math.min(s.scenario.maxLotTrays, traysLeft);
    const units = Math.min(unitsLeft, trays * rec.perTray);
    const lot: Lot = {
      id: `${def.id}-${String.fromCharCode(97 + k++)}`, orderId: def.id, product: def.product, trays, units,
      stage: "mix", running: false, since: s.now, endsAt: null, restEnd: null, workerId: null, stationId: null,
      ovenId: null, consumed: false, attempts: 0, blocked: null, bakedInOven: false,
    };
    s.lots[lot.id] = lot; s.lotOrder.push(lot.id); order.lotIds.push(lot.id);
    traysLeft -= trays; unitsLeft -= units;
  }
  s.orders[order.id] = order; s.orderOrder.push(order.id);
  log(s, def.vip ? "warn" : "info", `${def.customer} ordered ${def.qty} ${rec.name} (due ${fmt(def.deadline)})${def.vip ? " · VIP" : ""}`);
}
const fmt = (t: number) => { const m = 300 + t; return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`; };

function fireEvent(s: SimState, e: ScenarioEvent) {
  switch (e.kind) {
    case "order": addOrder(s, e.order); break;
    case "delivery":
      for (const [k, q] of Object.entries(e.items)) s.inventory[k as IngredientId] += q!;
      log(s, "good", `${e.label} arrived (${Object.keys(e.items).join(", ")})`);
      break;
    case "ovenBreak": {
      const o = s.ovens.find((x) => x.id === e.ovenId)!;
      o.brokenUntil = s.now + e.duration;
      const ids = [...o.lotIds];
      const baking = o.status === "baking" || o.status === "blocked";
      for (const id of ids) {
        const l = s.lots[id];
        if (baking && !l.bakedInOven) restartLot(s, l, "breakdown");
        else if (l.bakedInOven) { /* finished goods are safe – pull them out by hand */
          release(s, l, "work"); l.stage = "cool"; l.running = true; l.endsAt = s.now + recipeOf(s, l.product).coolMin; l.since = s.now;
        } else { release(s, l, "ruined"); l.stage = "bake"; l.since = s.now; } // was only pre-heating
      }
      o.lotIds = []; o.status = "broken"; o.targetTemp = null;
      s.intervals.push({ resource: o.id, start: s.now, end: s.now + e.duration, lotId: null, label: "Broken", color: "#c9c2c4", kind: "down" });
      log(s, "bad", `${o.name} broke down for ${e.duration} min${baking && ids.length ? ` – ${ids.length} tray lot(s) ruined` : ""}`);
      break;
    }
    case "workerOut": {
      const w = s.workers.find((x) => x.id === e.workerId)!;
      w.outUntil = s.now + e.duration;
      if (w.lotId) { const l = s.lots[w.lotId]; release(s, l, "ruined"); l.since = s.now; }
      s.intervals.push({ resource: w.id, start: s.now, end: s.now + e.duration, lotId: null, label: "Out", color: "#c9c2c4", kind: "down" });
      log(s, "bad", `${w.name} is out for ${e.duration} min`);
      break;
    }
  }
}

/** Push the next pending delivery back (supplier running late). */
export function delayDelivery(s: SimState, minutes: number) {
  const d = s.pending.find((e) => e.kind === "delivery");
  if (!d || d.kind !== "delivery") return false;
  d.at += minutes;
  s.pending.sort((a, b) => a.at - b.at);
  log(s, "bad", `${d.label} delayed to ${fmt(d.at)}`);
  return true;
}

/** Accidentally lose stock (spill / spoilage). Counts as ingredient waste. */
export function spill(s: SimState, ing: IngredientId, fraction: number) {
  const q = Math.round(s.inventory[ing] * fraction);
  if (q <= 0) return;
  s.inventory[ing] -= q;
  s.c.wasteByIngredient[ing] = (s.c.wasteByIngredient[ing] ?? 0) + q;
  const cost = q * s.scenario.ingredients.find((i) => i.id === ing)!.costPerUnit;
  s.waste.push({ t: s.now, reason: "spoiled", product: "roll", units: 0, cost, lotId: `spill-${ing}` });
  log(s, "bad", `Lost ${q} ${s.scenario.ingredients.find((i) => i.id === ing)!.unit} of ${ing}`);
}

export function inject(s: SimState, e: ScenarioEvent) {
  s.pending.push(e);
  s.pending.sort((a, b) => a.at - b.at);
}

// ---------------------------------------------------------------- completion

function completeOrderIfDone(s: SimState, o: Order) {
  if (o.status === "cancelled" || o.completedAt != null) return;
  if (o.lotIds.every((id) => s.lots[id].stage === "done")) {
    o.completedAt = s.now;
    o.status = s.now <= o.deadline ? "done" : "late";
    log(s, o.status === "done" ? "good" : "warn",
      `${o.customer}'s ${o.qty} ${recipeOf(s, o.product).name} ready${o.status === "late" ? ` (${s.now - o.deadline} min late)` : ""}`);
  }
}

function completions(s: SimState) {
  const t = s.now;
  // worker tasks
  for (const w of s.workers) {
    if (!w.lotId || w.busyUntil > t) continue;
    const l = s.lots[w.lotId];
    const rec = recipeOf(s, l.product);
    const st = s.stations.find((x) => x.id === w.stationId)!;
    st.lotId = null; w.lotId = null; w.stationId = null;
    l.workerId = l.stationId = null; l.running = false; l.endsAt = null; l.since = t;
    if (l.stage === "mix") {
      if (rec.restMin > 0) { l.stage = "rest"; l.running = true; l.endsAt = t + rec.restMin; }
      else { l.stage = "shape"; l.restEnd = t; }
    } else if (l.stage === "shape") l.stage = "bake";
    else if (l.stage === "finish") { l.stage = "done"; completeOrderIfDone(s, s.orders[l.orderId]); }
  }
  // passive stages
  for (const id of s.lotOrder) {
    const l = s.lots[id];
    if (l.stage === "rest" && l.endsAt != null && l.endsAt <= t) { l.stage = "shape"; l.running = false; l.endsAt = null; l.restEnd = t; l.since = t; }
    if (l.stage === "cool" && l.endsAt != null && l.endsAt <= t) { l.stage = "finish"; l.running = false; l.endsAt = null; l.since = t; }
  }
  // ovens
  for (const o of s.ovens) {
    if (o.status === "broken" && t >= o.brokenUntil) { o.status = "idle"; log(s, "good", `${o.name} repaired`); }
    if (o.status === "maintenance" && !inMaintenance(o, t)) o.status = "idle";
    if (o.status === "idle" && inMaintenance(o, t)) {
      o.status = "maintenance";
      const m = o.maintenance.find((m) => t >= m.start && t < m.end)!;
      s.intervals.push({ resource: o.id, start: t, end: m.end, lotId: null, label: "Maintenance", color: "#c9c2c4", kind: "down" });
    }
    if (o.status === "heating" && t >= o.heatDoneAt) {
      o.temp = o.targetTemp!; o.status = "baking"; o.batchStartedAt = t;
      for (const id of o.lotIds) {
        const l = s.lots[id];
        l.endsAt = t + recipeOf(s, l.product).bakeMin;
        s.intervals.push({ resource: o.id, start: t, end: l.endsAt, lotId: l.id, label: label(s, l), color: recipeOf(s, l.product).color, kind: "bake" });
      }
    }
    if (o.status === "baking" || o.status === "blocked") {
      for (const id of [...o.lotIds]) {
        const l = s.lots[id];
        if (l.endsAt != null && l.endsAt <= t) l.bakedInOven = true;
        if (l.bakedInOven && coolRackUse(s) + l.trays <= s.scenario.coolRackTrays) {
          o.lotIds = o.lotIds.filter((x) => x !== id);
          l.ovenId = null; l.bakedInOven = false; l.stage = "cool"; l.running = true; l.since = t;
          l.endsAt = t + recipeOf(s, l.product).coolMin;
        }
      }
      if (o.lotIds.length === 0) { o.status = "idle"; o.batchStartedAt = null; o.targetTemp = null; }
      else o.status = o.lotIds.every((id) => s.lots[id].bakedInOven) ? "blocked" : "baking";
    }
  }
}

// ---------------------------------------------------------------- constraints

function constraints(s: SimState) {
  const t = s.now;
  for (const id of s.lotOrder) {
    const l = s.lots[id];
    if ((l.stage === "shape" && !l.running) || (l.stage === "bake" && !l.ovenId)) {
      const rec = recipeOf(s, l.product);
      if (l.restEnd != null && t > l.restEnd + rec.proofWindow) {
        log(s, "bad", `${label(s, l)} over-proofed waiting for ${l.stage === "bake" ? "an oven" : "a bench"} – binned, remixing`);
        restartLot(s, l, "overproof");
      }
    }
  }
  for (const oid of s.orderOrder) {
    const o = s.orders[oid];
    if (o.completedAt != null || o.status === "cancelled") continue;
    if (t > o.deadline + s.scenario.patience) {
      o.status = "cancelled";
      for (const id of o.lotIds) {
        const l = s.lots[id];
        release(s, l, "ruined");
        wasteLot(s, l, "cancelled");
        l.stage = "scrapped";
      }
      log(s, "bad", `${o.customer} gave up on ${o.qty} ${recipeOf(s, o.product).name}`);
    } else if (o.status === "queued" && o.lotIds.some((id) => s.lots[id].consumed)) o.status = "active";
  }
}

// ---------------------------------------------------------------- dispatch

type TaskStage = "mix" | "shape" | "finish";
const ATC_K = 2;
const ATC_PBAR = 15; // typical task length (min)

function priorityKey(s: SimState, l: Lot): number {
  const o = s.orders[l.orderId];
  switch (s.policy) {
    case "fifo": return l.since * 1000 + s.lotOrder.indexOf(l.id) / 1000;
    case "edf": return o.deadline * 1000 + l.since;
    case "smart": {
      // ATC (Apparent Tardiness Cost): index = (w / p) · exp(−max(0, slack) / (K · p̄)).
      // Short jobs with little slack win; long jobs with lots of slack wait.
      const rec = recipeOf(s, l.product);
      const p = Math.max(1, stageDuration(rec, l.stage, l.trays));
      const slack = lotSlack(s, l);
      const w = (o.vip ? 2 : 1) * (1 + 0.15 * l.trays);
      const doomed = slack < -s.scenario.patience * 0.6 && !l.consumed;
      let atc = (w / p) * Math.exp(-Math.max(0, slack) / (ATC_K * ATC_PBAR));
      if (doomed) atc *= 1e-4; // triage: don't let lost orders steal the bottleneck
      // Dough that's about to over-proof jumps the queue outright.
      const proof = proofSlack(s, l);
      if (proof < 15) return -1e6 + proof;
      return -atc;
    }
  }
}

function eligibleWorkers(s: SimState, skill: string, rec: Recipe, stage: TaskStage, trays: number) {
  const t = s.now;
  return s.workers.filter((w) =>
    !w.lotId && w.outUntil <= t && w.skills.includes(skill as never) &&
    t >= w.shift[0] && t + stageDuration(rec, stage, trays, w.speed) <= w.shift[1]);
}

function startTask(s: SimState, l: Lot, w: WorkerState, stationId: string) {
  const rec = recipeOf(s, l.product);
  const dur = stageDuration(rec, l.stage, l.trays, w.speed);
  const st = s.stations.find((x) => x.id === stationId)!;
  w.lotId = l.id; w.stationId = stationId; w.busyUntil = s.now + dur;
  st.lotId = l.id;
  l.workerId = w.id; l.stationId = stationId; l.running = true; l.endsAt = s.now + dur; l.since = s.now; l.blocked = null;
  const verb = { mix: "Mix", shape: "Shape", finish: rec.finishSkill === "decorate" ? "Decorate" : "Pack" }[l.stage as TaskStage];
  const iv = { start: s.now, end: s.now + dur, lotId: l.id, label: `${verb} ${rec.name}`, color: rec.color, kind: "work" as const };
  s.intervals.push({ ...iv, resource: w.id }, { ...iv, resource: st.id });
}

function dispatchWork(s: SimState) {
  const t = s.now;
  const waiting = lotsWhere(s, (l) => !l.running && (l.stage === "mix" || l.stage === "shape" || l.stage === "finish"));
  waiting.sort((a, b) => priorityKey(s, a) - priorityKey(s, b));
  const claimed: Partial<Record<IngredientId, number>> = {};
  let rack = doughRackUse(s);

  for (const l of waiting) {
    const rec = recipeOf(s, l.product);
    const stage = l.stage as TaskStage;
    l.blocked = null;
    if (stage === "mix") {
      const need = needs(rec, l.units);
      const short = need.find(([k, q]) => s.inventory[k] < q);
      if (short) { l.blocked = `Short on ${short[0]}`; continue; }
      const reserved = need.find(([k, q]) => s.inventory[k] - (claimed[k] ?? 0) < q);
      if (reserved) { l.blocked = `${reserved[0]} reserved for urgent order`; continue; }
      if (rack + l.trays > s.scenario.doughRackTrays) { l.blocked = "Dough rack full"; continue; }
      // smart: reserve ingredients for higher-priority lots even if they can't start this minute
      if (s.policy === "smart") for (const [k, q] of need) claimed[k] = (claimed[k] ?? 0) + q;
    }
    const kind = STATION_FOR[stage](rec);
    const station = s.stations.find((x) => x.kind === kind && !x.lotId);
    if (!station) { l.blocked = `Waiting for ${kind}`; continue; }
    let ws = eligibleWorkers(s, SKILL_FOR[stage](rec), rec, stage, l.trays);
    if (!ws.length) { l.blocked = "No free baker"; continue; }
    if (s.policy === "smart") {
      // keep generalists free: least-skilled first, then fastest
      // finish soonest, but nudge toward specialists so generalists stay free
      const cost = (w: WorkerState) => stageDuration(rec, stage, l.trays, w.speed) + 2 * w.skills.length;
      ws = ws.sort((a, b) => cost(a) - cost(b));
    }
    const w = ws[0];
    if (stage === "mix") {
      for (const [k, q] of needs(rec, l.units)) {
        s.inventory[k] -= q;
        if (s.policy === "smart") claimed[k] = (claimed[k] ?? 0) - q;
      }
      l.consumed = true;
      rack += l.trays;
    }
    startTask(s, l, w, station.id);
  }
  void t;
}

interface BatchPlan { oven: OvenState; temp: number; lots: Lot[]; score: number; hold: boolean }

function fill(cands: Lot[], cap: number): Lot[] {
  const out: Lot[] = []; let used = 0;
  for (const l of cands) if (used + l.trays <= cap) { out.push(l); used += l.trays; }
  return out;
}
function fitsBeforeMaintenance(s: SimState, o: OvenState, temp: number, lots: Lot[]) {
  const end = s.now + heatMinutes(o, temp) + Math.max(...lots.map((l) => recipeOf(s, l.product).bakeMin));
  return end <= nextMaintenance(o, s.now);
}

function planBatch(s: SimState, ovens: OvenState[], ready: Lot[]): BatchPlan | null {
  if (!ready.length || !ovens.length) return null;
  const temps = [...new Set(ready.map((l) => recipeOf(s, l.product).bakeTemp))];
  const byTemp = (temp: number) => ready.filter((l) => recipeOf(s, l.product).bakeTemp === temp);

  if (s.policy !== "smart") {
    const sorted = [...ready].sort((a, b) => priorityKey(s, a) - priorityKey(s, b));
    const temp = recipeOf(s, sorted[0].product).bakeTemp;
    const group = sorted.filter((l) => recipeOf(s, l.product).bakeTemp === temp);
    for (const o of ovens) {
      const lots = fill(group, o.capacity);
      if (lots.length && fitsBeforeMaintenance(s, o, temp, lots)) return { oven: o, temp, lots, score: 0, hold: false };
    }
    return null;
  }

  // smart: score every (oven, temperature) pair
  let best: BatchPlan | null = null;
  for (const o of ovens) for (const temp of temps) {
    const group = byTemp(temp).sort((a, b) => priorityKey(s, a) - priorityKey(s, b));
    const lots = fill(group, o.capacity);
    if (!lots.length || !fitsBeforeMaintenance(s, o, temp, lots)) continue;
    const trays = lots.reduce((a, l) => a + l.trays, 0);
    const change = heatMinutes(o, temp);
    const minSlack = Math.min(...lots.map((l) => Math.min(lotSlack(s, l) - change, proofSlack(s, l) - change)));
    const bakeSpread = Math.max(...lots.map((l) => recipeOf(s, l.product).bakeMin)) - Math.min(...lots.map((l) => recipeOf(s, l.product).bakeMin));
    const fillRatio = trays / o.capacity;
    const score = 100 * fillRatio - 3 * change - 0.8 * bakeSpread + Math.max(0, 60 - minSlack) * 2;
    // Hold for a fuller batch if nothing is urgent and same-temp dough is about to be ready.
    let hold = false;
    if (fillRatio < 0.75 && minSlack > 45 + change) {
      const soon = lotsWhere(s, (l) =>
        recipeOf(s, l.product).bakeTemp === temp && (
          (l.stage === "shape") || (l.stage === "rest" && l.endsAt != null && l.endsAt - s.now <= 12)))
        .reduce((a, l) => a + l.trays, 0);
      hold = soon > 0 && trays + soon <= o.capacity + 1;
    }
    if (!best || score > best.score) best = { oven: o, temp, lots, score, hold };
  }
  return best;
}

function dispatchOvens(s: SimState) {
  const t = s.now;
  for (const o of s.ovens) if (o.status === "holding") o.status = "idle";
  for (let guard = 0; guard < s.ovens.length; guard++) {
    const free = s.ovens.filter((o) => o.status === "idle" && !inMaintenance(o, t) && o.brokenUntil <= t);
    const ready = lotsWhere(s, (l) => l.stage === "bake" && !l.ovenId);
    for (const l of ready) l.blocked = "Waiting for oven";
    const plan = planBatch(s, free, ready);
    if (!plan) return;
    if (plan.hold) { plan.oven.status = "holding"; continue; }
    const { oven: o, temp, lots } = plan;
    const change = heatMinutes(o, temp);
    o.lotIds = lots.map((l) => l.id);
    for (const l of lots) { l.ovenId = o.id; l.running = true; l.since = t; l.blocked = null; l.endsAt = null; }
    s.c.batches++;
    const trays = lots.reduce((a, l) => a + l.trays, 0);
    if (change > 0) {
      s.c.changeovers++;
      o.status = "heating"; o.targetTemp = temp; o.heatFrom = o.temp; o.heatStart = t; o.heatDoneAt = t + change;
      s.intervals.push({ resource: o.id, start: t, end: t + change, lotId: null, label: `${o.temp}→${temp}°C`, color: "#f6d7a7", kind: "heat" });
      log(s, "info", `${o.name} ${o.temp > temp ? "cooling" : "heating"} ${o.temp}→${temp}°C for ${trays}/${o.capacity} trays`);
    } else {
      o.targetTemp = temp; o.status = "baking"; o.batchStartedAt = t;
      for (const l of lots) {
        l.endsAt = t + recipeOf(s, l.product).bakeMin;
        s.intervals.push({ resource: o.id, start: t, end: l.endsAt, lotId: l.id, label: label(s, l), color: recipeOf(s, l.product).color, kind: "bake" });
      }
      log(s, "info", `${o.name} baking ${trays}/${o.capacity} trays at ${temp}°C`);
    }
  }
}

// ---------------------------------------------------------------- metrics

function accumulate(s: SimState) {
  const t = s.now;
  for (const w of s.workers) {
    if (t < w.shift[0] || t >= w.shift[1] || w.outUntil > t) continue;
    if (w.lotId) s.c.workerBusy[w.id]++; else s.c.workerIdle[w.id]++;
  }
  const waitingBake = lotsWhere(s, (l) => l.stage === "bake" && !l.ovenId).length > 0;
  for (const o of s.ovens) {
    // animate temperature
    if (o.status === "heating" && o.targetTemp != null) {
      const k = Math.min(1, (t + 1 - o.heatStart) / Math.max(1, o.heatDoneAt - o.heatStart));
      o.temp = Math.round(o.heatFrom + (o.targetTemp - o.heatFrom) * k);
    }
    if (t >= s.scenario.dayLength) continue;
    switch (o.status) {
      case "baking":
        s.c.ovenBake[o.id]++;
        s.c.ovenTrayMinutes[o.id] += o.lotIds.reduce((a, id) => a + s.lots[id].trays, 0);
        s.c.ovenCapMinutes[o.id] += o.capacity;
        break;
      case "heating": s.c.ovenHeat[o.id]++; break;
      case "blocked": s.c.ovenBlocked[o.id]++; break;
      case "maintenance": case "broken": s.c.ovenDown[o.id]++; break;
      default: s.c.ovenIdle[o.id]++; if (waitingBake) s.c.ovenIdleWithWork[o.id]++;
    }
  }
  for (const st of s.stations) if (st.lotId) s.c.stationBusy[st.id]++;
  s.c.shortageLotMinutes += lotsWhere(s, (l) => !!l.blocked?.startsWith("Short")).length;
  if (t % 10 === 0) {
    const ords = Object.values(s.orders);
    s.c.series.push({
      t, wip: lotsWhere(s, (l) => l.consumed && l.stage !== "done" && l.stage !== "scrapped").length,
      queue: lotsWhere(s, (l) => !l.consumed && l.stage === "mix").length,
      done: ords.filter((o) => o.status === "done").length, late: ords.filter((o) => o.status === "late").length,
      waste: s.waste.reduce((a, w) => a + w.cost, 0),
    });
  }
}

// ---------------------------------------------------------------- main loop

export function step(s: SimState) {
  if (s.finished) return;
  while (s.pending.length && s.pending[0].at <= s.now) fireEvent(s, s.pending.shift()!);
  completions(s);
  constraints(s);
  dispatchWork(s);
  dispatchOvens(s);
  accumulate(s);
  s.now++;
  const open = Object.values(s.orders).some((o) => o.completedAt == null && o.status !== "cancelled");
  const moreOrders = s.pending.some((e) => e.kind === "order");
  if ((!open && !moreOrders && s.now >= s.scenario.dayLength) || s.now >= s.scenario.dayLength + 200) {
    s.finished = true;
    log(s, "info", "Bakery closed for the day");
  }
}

export function runToEnd(s: SimState, maxSteps = 5000) {
  for (let i = 0; i < maxSteps && !s.finished; i++) step(s);
  return s;
}

/**
 * Forecast: clone the live state, drop events we can't know about yet
 * (future orders, surprise breakdowns), and run it out. Gives projected
 * completion per order + the planned schedule for the Gantt chart.
 */
export function forecast(s: SimState) {
  const f: SimState = structuredClone(s);
  f.pending = f.pending.filter((e) => e.kind === "delivery");
  f.log = [];
  runToEnd(f);
  const eta: Record<string, { at: number | null; status: Order["status"] }> = {};
  for (const id of f.orderOrder) eta[id] = { at: f.orders[id].completedAt, status: f.orders[id].status };
  return { eta, intervals: f.intervals.filter((iv) => iv.end > s.now), summary: summarize(f) };
}

export function summarize(s: SimState): Summary {
  const ords = Object.values(s.orders);
  const finishedOrders = ords.filter((o) => o.completedAt != null);
  const late = ords.filter((o) => o.status === "late");
  const lateness = late.map((o) => o.completedAt! - o.deadline);
  const units = finishedOrders.reduce((a, o) => a + o.qty, 0);
  const makespan = Math.max(0, ...finishedOrders.map((o) => o.completedAt!));
  const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
  const busy = sum(s.c.workerBusy), idle = sum(s.c.workerIdle);
  const bake = sum(s.c.ovenBake), oIdle = sum(s.c.ovenIdle);
  const avail = bake + oIdle + sum(s.c.ovenHeat) + sum(s.c.ovenBlocked);
  const hours = Math.max(1, Math.min(s.now, s.scenario.dayLength)) / 60;
  return {
    policy: s.policy, seed: s.scenario.seed,
    orders: ords.length, ordersDone: finishedOrders.length,
    ordersOnTime: ords.filter((o) => o.status === "done").length, ordersLate: late.length,
    ordersCancelled: ords.filter((o) => o.status === "cancelled").length,
    onTimePct: ords.length ? (100 * ords.filter((o) => o.status === "done").length) / ords.length : 0,
    avgLatenessMin: lateness.length ? lateness.reduce((a, b) => a + b, 0) / lateness.length : 0,
    maxLatenessMin: Math.max(0, ...lateness),
    unitsDone: units, throughputUnitsPerHr: units / hours, ordersPerHr: finishedOrders.length / hours, makespan,
    workerUtilPct: busy + idle ? (100 * busy) / (busy + idle) : 0, workerIdleMin: idle,
    ovenUtilPct: avail ? (100 * bake) / avail : 0, ovenIdleMin: oIdle, ovenIdleWithWorkMin: sum(s.c.ovenIdleWithWork),
    ovenFillPct: sum(s.c.ovenCapMinutes) ? (100 * sum(s.c.ovenTrayMinutes)) / sum(s.c.ovenCapMinutes) : 0,
    changeovers: s.c.changeovers, batches: s.c.batches,
    wasteCost: s.waste.reduce((a, w) => a + w.cost, 0), wasteUnits: s.waste.reduce((a, w) => a + w.units, 0),
    overproofs: s.c.overproofs, shortageLotMinutes: s.c.shortageLotMinutes,
    wasteByIngredient: s.c.wasteByIngredient,
  };
}