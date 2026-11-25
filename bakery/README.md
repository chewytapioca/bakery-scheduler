# 🐰 Bunbun Bakery — Production Scheduler

A tiny bakery where orders are automatically scheduled through production stages
(**mix → rest → shape → bake → cool → decorate/pack**), with a live animated floor,
a forecast Gantt chart, metrics, and a head-to-head comparison of scheduling policies.

**Stack:** Next.js 15 (App Router) · TypeScript · PostgreSQL (`pg`) · zero UI dependencies.

## Quick start

```bash
npm install
npm run dev                # http://localhost:3000 — runs on built-in data, no DB needed
```

With PostgreSQL:

```bash
createdb bakery
export DATABASE_URL=postgres://postgres@localhost:5432/bakery
npm run db:setup           # creates tables (db/schema.sql) and seeds catalog + today's orders
npm run dev                # header badge shows "● PostgreSQL"
```

Other scripts: `npm test` (engine invariants over 25 days × 3 policies), `npm run bench [-- 30]`
(policy averages across seeded days), `node scripts/build-preview.mjs` (single-file offline build).

## What's modelled

| Constraint | How |
|---|---|
| Dough must rest | Each recipe has a rest time and a **proof window**; dough not in an oven within the window over-proofs, is binned (counted as waste) and re-mixed. |
| Limited ovens | 3 ovens with tray capacity, **one temperature per batch**, heat-up/cool-down changeover time (°C/min), scheduled maintenance windows, random breakdowns (ruins the batch in progress). |
| Stations & workers | Mixers, benches, decor table, counter; 5 bakers with skills, speeds and shifts. A task needs a free station **and** a qualified baker who can finish before their shift ends. |
| Racks | Dough rack (WIP cap — mixing stops when full) and cooling rack (ovens can't unload when it's full → "blocked"). |
| Ingredients | Consumed at mixing; deliveries arrive during the day; shortages block mixing. |
| Deadlines | Orders arrive through the day with due times; customers cancel after 90 min past due (in-progress goods become waste). |

Disruptions you can trigger live: break an oven, a baker calls in sick, delay a delivery, spill flour, rush VIP order.

## Scheduling policies (`lib/engine/sim.ts`)

All three use the same engine and constraints; only the decisions differ.

* **FIFO** — queues served in arrival order; batches filled with whatever is first in line; first free baker.
* **Earliest deadline (EDF)** — queues sorted by due time; batches seeded by the most urgent tray.
* **Slack + batching** —
  * **ATC (Apparent Tardiness Cost)** ranking for worker tasks: `(w/p)·exp(−slack⁺/(K·p̄))`, K=2. Favors short, urgent jobs on the bottleneck (the mixers).
  * Dough within 15 min of over-proofing jumps the queue.
  * **Triage**: orders that will blow past customer patience are moved to the back instead of dragging others late (EDF's "domino effect" under overload).
  * **Ingredient reservation** in priority order, so low-priority lots can't consume stock an urgent lot needs.
  * **Batch scoring** over every (oven, temperature) pair: fill ratio, changeover minutes, bake-time spread, urgency; maintenance-aware.
  * **Hold-for-batch**: an oven may wait briefly for same-temperature dough that's minutes away if nothing is urgent.

Average over 30 seeded days (`npm run bench`):

| | On-time | Avg lateness | Cancelled | Waste |
|---|---|---|---|---|
| FIFO | 67% | 31 min | 3.1 | $52 |
| EDF | 60% | 32 min | 3.4 | $59 |
| **Slack + batching** | **73%** | **25 min** | **2.6** | **$42** |

The **forecast** (Schedule tab) clones live state, drops events nobody could know yet
(future orders, breakdowns), and runs the same dispatcher to the end of day — giving each
order an ETA and the dashed "planned" bars on the Gantt. It re-plans every 5 simulated minutes.

## Metrics

Throughput (items/hr, orders/hr), on-time %, lateness, cancellations, worker & oven idle time
(including *oven idle while dough was waiting*), oven batch fill %, temperature changeovers,
over-proofs, shortage lot-minutes, and wasted ingredients by cause and by ingredient ($).

## API

| Route | |
|---|---|
| `GET /api/scenario?seed=7` | Catalog + today's orders (from Postgres if configured) |
| `GET /api/orders` / `POST /api/orders` | List / add an order (`{customer, product, qty, releaseAt, deadline, vip?}`) |
| `POST /api/runs` | Simulate a full day server-side (`{policy, seed}`) and persist metrics + waste log |
| `GET /api/runs` | Saved run history |
| `POST /api/compare` | Run all policies on the same day (`{seed, save?}`) |

Times are minutes after opening (t=0 → 05:00).

## Layout

```
lib/engine/      types, catalog, scenario generator, simulator + policies (framework-free)
lib/db.ts        PostgreSQL access (optional)
db/schema.sql    tables: ingredients, recipes, recipe_ingredients, workers, stations, ovens,
                 oven_maintenance, orders, deliveries, sim_runs, waste_log
app/api/*        route handlers
components/      BakeryApp, Floor (pipeline/ovens/bakers/pantry), Schedule (Gantt/orders), Metrics
public/sprites/  characters & goods cut from the sprite sheet
```
