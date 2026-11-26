import { Pool } from "pg";
import {
  makeScenario, type Ingredient, type IngredientId, type OrderDef, type OvenDef, type Recipe, type Scenario,
  type ScenarioEvent, type SimState, type StationDef, type Summary, type WorkerDef,
} from "./engine";

/** PostgreSQL is optional: without DATABASE_URL the app runs on the built-in seed scenario. */
let pool: Pool | null = null;
export function db(): Pool | null {
  if (!process.env.DATABASE_URL) return null;
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  return pool;
}

const num = (x: unknown) => Number(x);

/** Load the bakery's catalog + today's orders from Postgres into an engine Scenario. */
export async function loadScenario(seed = 7): Promise<{ scenario: Scenario; source: "postgres" | "seed" }> {
  const base = makeScenario(seed);
  const p = db();
  if (!p) return { scenario: base, source: "seed" };
  const [ing, rec, ri, wk, st, ov, mt, ord, del] = await Promise.all([
    p.query("SELECT * FROM ingredients ORDER BY id"),
    p.query("SELECT * FROM recipes ORDER BY id"),
    p.query("SELECT * FROM recipe_ingredients"),
    p.query("SELECT * FROM workers ORDER BY id"),
    p.query("SELECT * FROM stations ORDER BY id"),
    p.query("SELECT * FROM ovens ORDER BY id"),
    p.query("SELECT * FROM oven_maintenance"),
    p.query("SELECT * FROM orders WHERE day = current_date ORDER BY release_at, id"),
    p.query("SELECT * FROM deliveries WHERE day = current_date ORDER BY at_min"),
  ]);
  if (!rec.rowCount) return { scenario: base, source: "seed" };

  const ingredients: Ingredient[] = ing.rows.map((r) => ({ id: r.id, name: r.name, unit: r.unit, costPerUnit: num(r.cost_per_unit) }));
  const recipes: Recipe[] = rec.rows.map((r) => ({
    id: r.id, name: r.name, sprite: r.sprite, color: r.color, perTray: r.per_tray,
    ingredientsPerUnit: Object.fromEntries(ri.rows.filter((x) => x.recipe_id === r.id).map((x) => [x.ingredient_id, num(x.qty_per_unit)])),
    mixBase: r.mix_base, mixPerTray: r.mix_per_tray, restMin: r.rest_min, proofWindow: r.proof_window,
    shapePerTray: r.shape_per_tray, bakeTemp: r.bake_temp, bakeMin: r.bake_min, coolMin: r.cool_min,
    finishSkill: r.finish_skill, finishPerTray: r.finish_per_tray,
  }));
  const workers: WorkerDef[] = wk.rows.map((r) => ({ id: r.id, name: r.name, sprite: r.sprite, role: r.role, skills: r.skills, speed: num(r.speed), shift: [r.shift_start, r.shift_end] }));
  const stations: StationDef[] = st.rows.map((r) => ({ id: r.id, name: r.name, kind: r.kind }));
  const ovens: OvenDef[] = ov.rows.map((r) => ({
    id: r.id, name: r.name, capacity: r.capacity, startTemp: r.start_temp, heatRate: num(r.heat_rate), coolRate: num(r.cool_rate),
    maintenance: mt.rows.filter((m) => m.oven_id === r.id).map((m) => ({ start: m.start_min, end: m.end_min })),
  }));
  const orders: OrderDef[] = ord.rowCount
    ? ord.rows.map((r) => ({ id: r.id, customer: r.customer, product: r.product, qty: r.qty, releaseAt: r.release_at, deadline: r.deadline, vip: r.vip }))
    : base.orders;
  const events: ScenarioEvent[] = del.rowCount
    ? del.rows.map((r) => ({ at: r.at_min, kind: "delivery" as const, label: r.label, items: r.items }))
    : base.events;
  const inventory = Object.fromEntries(ing.rows.map((r) => [r.id, num(r.on_hand)])) as Record<IngredientId, number>;
  return { scenario: { ...base, ingredients, recipes, workers, stations, ovens, orders, events, inventory }, source: "postgres" };
}

export async function saveRun(summary: Summary, state?: SimState, source = "api"): Promise<number | null> {
  const p = db();
  if (!p) return null;
  const { rows } = await p.query(
    `INSERT INTO sim_runs (policy, seed, source, on_time_pct, avg_lateness, throughput, oven_util, worker_util, waste_cost, summary)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [summary.policy, summary.seed, source, summary.onTimePct, summary.avgLatenessMin, summary.throughputUnitsPerHr,
      summary.ovenUtilPct, summary.workerUtilPct, summary.wasteCost, summary],
  );
  const id = Number(rows[0].id);
  if (state?.waste.length) {
    const vals = state.waste.flatMap((w) => [id, w.t, w.reason, w.product, w.units, w.cost]);
    const ph = state.waste.map((_, i) => `($${i * 6 + 1},$${i * 6 + 2},$${i * 6 + 3},$${i * 6 + 4},$${i * 6 + 5},$${i * 6 + 6})`).join(",");
    await p.query(`INSERT INTO waste_log (run_id, t, reason, product, units, cost) VALUES ${ph}`, vals);
  }
  return id;
}

export async function recentRuns(limit = 30) {
  const p = db();
  if (!p) return [];
  const { rows } = await p.query(
    `SELECT id, created_at, policy, seed, source, on_time_pct, avg_lateness, throughput, oven_util, worker_util, waste_cost
     FROM sim_runs ORDER BY created_at DESC LIMIT $1`, [limit]);
  return rows;
}

export async function insertOrder(o: OrderDef) {
  const p = db();
  if (!p) return false;
  await p.query(
    `INSERT INTO orders (id, customer, product, qty, release_at, deadline, vip) VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (id) DO NOTHING`, [o.id, o.customer, o.product, o.qty, o.releaseAt, o.deadline, !!o.vip]);
  return true;
}
