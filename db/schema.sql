-- Bunbun Bakery scheduler schema (PostgreSQL 13+)

CREATE TABLE IF NOT EXISTS ingredients (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  unit          text NOT NULL CHECK (unit IN ('g','ml','pc')),
  cost_per_unit numeric(10,5) NOT NULL,
  on_hand       numeric(12,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS recipes (
  id              text PRIMARY KEY,
  name            text NOT NULL,
  sprite          text NOT NULL,
  color           text NOT NULL,
  per_tray        int  NOT NULL CHECK (per_tray > 0),
  mix_base        int  NOT NULL, mix_per_tray int NOT NULL,
  rest_min        int  NOT NULL, proof_window int NOT NULL,
  shape_per_tray  int  NOT NULL,
  bake_temp       int  NOT NULL, bake_min int NOT NULL,
  cool_min        int  NOT NULL,
  finish_skill    text NOT NULL CHECK (finish_skill IN ('decorate','pack')),
  finish_per_tray int  NOT NULL
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  recipe_id     text REFERENCES recipes(id) ON DELETE CASCADE,
  ingredient_id text REFERENCES ingredients(id),
  qty_per_unit  numeric(10,3) NOT NULL,
  PRIMARY KEY (recipe_id, ingredient_id)
);

CREATE TABLE IF NOT EXISTS workers (
  id text PRIMARY KEY, name text NOT NULL, sprite text NOT NULL, role text NOT NULL,
  skills text[] NOT NULL, speed numeric(4,2) NOT NULL,
  shift_start int NOT NULL, shift_end int NOT NULL
);

CREATE TABLE IF NOT EXISTS stations (
  id text PRIMARY KEY, name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('mixer','bench','decor','pack'))
);

CREATE TABLE IF NOT EXISTS ovens (
  id text PRIMARY KEY, name text NOT NULL, capacity int NOT NULL,
  start_temp int NOT NULL, heat_rate numeric(5,2) NOT NULL, cool_rate numeric(5,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS oven_maintenance (
  id serial PRIMARY KEY, oven_id text REFERENCES ovens(id) ON DELETE CASCADE,
  start_min int NOT NULL, end_min int NOT NULL CHECK (end_min > start_min)
);

-- Orders for a bakery day. Minutes are relative to opening (05:00).
CREATE TABLE IF NOT EXISTS orders (
  id         text PRIMARY KEY,
  day        date NOT NULL DEFAULT current_date,
  customer   text NOT NULL,
  product    text NOT NULL REFERENCES recipes(id),
  qty        int  NOT NULL CHECK (qty > 0),
  release_at int  NOT NULL,
  deadline   int  NOT NULL CHECK (deadline > release_at),
  vip        boolean NOT NULL DEFAULT false,
  status     text NOT NULL DEFAULT 'queued',
  completed_at int,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_day_idx ON orders(day, release_at);

CREATE TABLE IF NOT EXISTS deliveries (
  id serial PRIMARY KEY, day date NOT NULL DEFAULT current_date,
  at_min int NOT NULL, label text NOT NULL, items jsonb NOT NULL
);

-- Every simulation/benchmark run, for comparing policies over time.
CREATE TABLE IF NOT EXISTS sim_runs (
  id          bigserial PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now(),
  policy      text NOT NULL CHECK (policy IN ('fifo','edf','smart')),
  seed        int  NOT NULL,
  source      text NOT NULL DEFAULT 'api',
  on_time_pct numeric(5,2), avg_lateness numeric(8,2), throughput numeric(8,2),
  oven_util   numeric(5,2), worker_util numeric(5,2), waste_cost numeric(10,2),
  summary     jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS sim_runs_policy_idx ON sim_runs(policy, created_at DESC);

CREATE TABLE IF NOT EXISTS waste_log (
  id bigserial PRIMARY KEY, run_id bigint REFERENCES sim_runs(id) ON DELETE CASCADE,
  t int NOT NULL, reason text NOT NULL, product text NOT NULL, units int NOT NULL, cost numeric(10,2) NOT NULL
);
