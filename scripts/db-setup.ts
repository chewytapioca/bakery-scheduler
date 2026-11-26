// Creates tables and seeds catalog + today's orders:  DATABASE_URL=postgres://… npm run db:setup
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { makeScenario } from "../lib/engine";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL, e.g. postgres://postgres@localhost:5432/bakery");
  const c = new Client({ connectionString: url });
  await c.connect();
  await c.query(readFileSync(join(__dirname, "../db/schema.sql"), "utf8"));
  const sc = makeScenario(Number(process.env.SEED ?? 7));
  await c.query("BEGIN");
  for (const i of sc.ingredients)
    await c.query(`INSERT INTO ingredients VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET on_hand = EXCLUDED.on_hand`,
      [i.id, i.name, i.unit, i.costPerUnit, sc.inventory[i.id]]);
  for (const r of sc.recipes) {
    await c.query(`INSERT INTO recipes VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT (id) DO NOTHING`,
      [r.id, r.name, r.sprite, r.color, r.perTray, r.mixBase, r.mixPerTray, r.restMin, r.proofWindow, r.shapePerTray, r.bakeTemp, r.bakeMin, r.coolMin, r.finishSkill, r.finishPerTray]);
    for (const [ing, q] of Object.entries(r.ingredientsPerUnit))
      await c.query(`INSERT INTO recipe_ingredients VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [r.id, ing, q]);
  }
  for (const w of sc.workers)
    await c.query(`INSERT INTO workers VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`, [w.id, w.name, w.sprite, w.role, w.skills, w.speed, w.shift[0], w.shift[1]]);
  for (const s of sc.stations) await c.query(`INSERT INTO stations VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING`, [s.id, s.name, s.kind]);
  for (const o of sc.ovens) {
    await c.query(`INSERT INTO ovens VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`, [o.id, o.name, o.capacity, o.startTemp, o.heatRate, o.coolRate]);
    await c.query(`DELETE FROM oven_maintenance WHERE oven_id = $1`, [o.id]);
    for (const m of o.maintenance) await c.query(`INSERT INTO oven_maintenance (oven_id, start_min, end_min) VALUES ($1,$2,$3)`, [o.id, m.start, m.end]);
  }
  await c.query(`DELETE FROM orders WHERE day = current_date`);
  for (const o of sc.orders)
    await c.query(`INSERT INTO orders (id, customer, product, qty, release_at, deadline, vip) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [o.id, o.customer, o.product, o.qty, o.releaseAt, o.deadline, !!o.vip]);
  await c.query(`DELETE FROM deliveries WHERE day = current_date`);
  for (const e of sc.events) if (e.kind === "delivery")
    await c.query(`INSERT INTO deliveries (at_min, label, items) VALUES ($1,$2,$3)`, [e.at, e.label, JSON.stringify(e.items)]);
  await c.query("COMMIT");
  console.log(`Seeded ${sc.recipes.length} recipes, ${sc.orders.length} orders, ${sc.ovens.length} ovens.`);
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
