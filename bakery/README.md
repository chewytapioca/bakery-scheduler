# Bunbun Bakery — Production Scheduler

A bakery simulator that schedules orders through production: **mix → rest → shape → bake → cool → decorate/pack**. Dough has to rest, ovens are limited, bakers work shifts, ingredients run out, and orders have deadlines. Built with Next.js, TypeScript and PostgreSQL (optional).

```bash
npm install
npm run dev     #
```

This README goes file by file: what data structures each one uses and how it works.

**Short version:** the code uses arrays, hash maps (plain JS objects), one set, one map, and sorting. There are no heaps, trees, linked lists, stacks or graphs.

---

## lib/engine/ — the simulator

### `types.ts`

Defines the shapes of all the data. No logic.

- **Interfaces** for records: `Recipe`, `Lot`, `Order`, `OvenState`, `SimState`…
- **Hash map types**: `Record<string, Lot>` for lots by ID, `Record<IngredientId, number>` for stock.
- **Tagged union**: `ScenarioEvent` is one of `order | delivery | ovenBreak | workerOut`. The `kind` field tells you which, and TypeScript checks that you handle each case.
- **Tuple**: `shift: [number, number]` for a baker's start and end minute.

### `catalog.ts`

The fixed bakery setup: 8 ingredients, 9 recipes, 5 bakers, 6 stations, 3 ovens, and starting stock.

- **Arrays of objects** for each list (`RECIPES`, `WORKERS`, `OVENS`…).
- **Hash map** for starting stock: `{ flour: 60000, butter: 9000, … }`.
- **Lookup table of functions**: `SKILL_FOR` and `STATION_FOR` map a stage to the skill or station it needs. For `finish`, it returns `decor` or `pack` depending on the recipe.

### `scenario.ts`

Generates one day of orders from a seed number.

- **Seeded random number generator** (`mulberry32`): a closure that holds one number and scrambles it with bit math on each call. Same seed → same numbers → same day every time.
- **Array of orders**, built in a loop, then **sorted** by arrival time.
- **Hash map** of quantity ranges per product.
- `criticalPath()` adds up a recipe's stage times: the fastest a lot could finish with no waiting. Deadlines are set to at least this, so every order is possible.

### `sim.ts` — the core

Holds the whole bakery state and moves it forward one minute at a time.

**The state (`SimState`)**

| Field | Structure | Why |
|---|---|---|
| `lots`, `orders` | Hash map by ID | `O(1)` lookup, used constantly |
| `lotOrder`, `orderOrder` | Array of IDs | Keeps arrival order, so the maps can be walked in a known order |
| `workers`, `stations`, `ovens` | Array | Small (5, 6, 3), so `.find()` by ID is fine |
| `pending` | Array kept sorted by time | The event queue (see below) |
| `inventory`, counters | Hash map | Stock per ingredient, minutes per resource |
| `intervals` | Array | Every task as `{resource, start, end}`, drawn on the Gantt chart |
| `log` | Array capped at 400 | Keeps only the newest messages |

**The event queue.** Future events (orders, deliveries, breakdowns) sit in `pending`, sorted by time. Each minute:

```ts
while (s.pending.length && s.pending[0].at <= s.now) fireEvent(s, s.pending.shift()!);
```

It's a sorted array used as a priority queue. Adding an event re-sorts the array, and `.shift()` removes from the front; both are `O(n)`. A min-heap would do both in `O(log n)`, but with about 40 events it doesn't matter.

**One minute (`step()`):**
1. Fire due events.
2. Finish tasks whose time is up and move lots to the next stage.
3. Bin over-proofed dough, and cancel orders 90+ minutes past due.
4. Assign tasks to bakers.
5. Fill ovens.
6. Add to the metric counters.

**Assigning tasks (`dispatchWork()`):** greedy. Collect waiting lots into an array, sort it by priority, walk it top to bottom, and start every lot that can start right now (ingredients, rack space, a free station and a qualified baker). Lots that can't start are skipped and labelled with the reason. A short-lived **hash map**, `claimed`, tracks ingredients reserved by higher-priority lots during the walk.

**Priority (`priorityKey()`):** one number per lot. The three policies are three different formulas plugged into the same sort:
- **FIFO:** when the lot started waiting.
- **EDF** (earliest deadline first): the order's due time.
- **Smart:** a score that favors urgent, short jobs. Urgency comes from **slack** = deadline − now − work left. Dough about to over-proof jumps to the front, and orders that will be cancelled anyway go to the back.

**Filling ovens (`planBatch()`):**
- A **set** finds the distinct temperatures among ready trays.
- `fill()` goes through trays in priority order and adds each one that still fits (greedy first-fit).
- The smart policy tries every (oven, temperature) pair (3 × 4 = 12) and keeps the best score: fuller batch, less heat-up time, more urgent trays.

**Forecast (`forecast()`):** deep-copies the whole state with `structuredClone`, deletes future events nobody could know about, and runs the copy to closing time. That gives each order an ETA without touching the real bakery.

**Slow spots worth knowing:**
- `recipeOf()` finds a recipe with `.find()` on an array of 9 items, and it's called a lot. A hash map would be `O(1)`.
- `lotsWhere()` scans every lot each time it's called.
- The FIFO key calls `lotOrder.indexOf()` inside the sort comparator, which makes that sort roughly `O(n² log n)`.
- The log trims from the front with `splice`, which shifts every item.

All of these are fine at about 100 lots, and all are fixable.

### `index.ts`

Re-exports the engine. Adds `runPolicy()` (deep-copy a scenario, run a whole day, summarize it) and `comparePolicies()` (do that for all three policies). `POLICIES` is an array of `{id, name, blurb}`.

---

## lib/ — other

### `db.ts`

PostgreSQL access with the `pg` library.

- **Connection pool** (`Pool`): keeps up to 5 open database connections and reuses them, so each request doesn't have to reconnect.
- `loadScenario()` runs 9 queries at once with `Promise.all`, gets back **arrays of rows**, and converts them into the engine's objects, joining recipe ingredients onto recipes with `.filter()`.
- `saveRun()` inserts one row per run, plus all of that run's waste events in one multi-row insert.
- If `DATABASE_URL` isn't set, everything falls back to the built-in data.

### `sprites.ts`

One function that turns a sprite name into an image URL. It checks a global **hash map** first (used by the offline build), otherwise it returns `/sprites/<name>.webp`.

---

## app/api/ — routes

Each file exports `GET` and/or `POST` handlers that return JSON.

| File | Does | Structures |
|---|---|---|
| `scenario/route.ts` | Loads the day (PostgreSQL or built-in) | — |
| `orders/route.ts` | Lists orders, or adds one after validating it | Object |
| `runs/route.ts` | Simulates a full day for one policy and saves it; lists saved runs | A **set** of valid policy names |
| `compare/route.ts` | Runs all 3 policies on the same day | Array of results |

`app/layout.tsx` and `app/page.tsx` are Next.js wiring: the HTML shell, and a page that renders `BakeryApp`.

---

## components/ — the UI (React)

### `BakeryApp.tsx`

The main component. The simulation state lives in a **ref** (`useRef`), a box React doesn't watch, so the engine can change it directly and quickly. A frame counter in `useState` forces a re-render after each tick. The play loop uses `requestAnimationFrame` and turns real seconds into simulated minutes. The forecast is recomputed only every 5 simulated minutes (`useMemo`).

### `Floor.tsx`

The pipeline, ovens, bakers and pantry.

- Each pipeline column **filters** the lot array by stage.
- Card animation uses a **map** from lot ID → last screen position. After each render it compares old and new positions and animates the card sliding between columns.
- The pantry builds a **hash map** of ingredient demand from lots not yet mixed.

### `Schedule.tsx`

The Gantt chart and orders table. Each interval becomes an SVG rectangle: x = start time, width = duration, row = resource. The orders table uses a sorted copy of the orders array.

### `Metrics.tsx`

Charts and the policy comparison. It turns the counter hash maps into bars, the time series array into a line chart, and groups waste by cause into a hash map. The 30-day benchmark runs 90 simulations and averages each field.

### `Kpis.tsx`

Six summary tiles. It reads one summary object and has no structures of its own.

---

## scripts/

| File | Does |
|---|---|
| `db-setup.ts` | Runs `db/schema.sql`, then inserts the catalog and today's orders in one transaction. |
| `test-engine.ts` | Runs 25 days × 3 policies and checks every minute that nothing breaks a rule (oven capacity, one temperature per batch, bakers on shift, racks not overfull, stock never negative). Uses a **set** to catch a lot on two stations at once. |
| `bench.ts` | Runs N days per policy and prints the averages in a table. |
| `build-preview.mjs` | Bundles the app into one offline HTML file. |

`preview/entry.tsx` is the entry point for that offline build: it loads the sprites into the global hash map and mounts the app.
