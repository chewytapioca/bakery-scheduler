// Core domain types for the bakery production simulator.
// Time is measured in whole minutes since the bakery opens (t=0 → 05:00).

export type IngredientId =
  | "flour" | "butter" | "sugar" | "eggs" | "milk" | "yeast" | "cream" | "strawberry";

export type ProductId =
  | "croissant" | "melon" | "roll" | "cupcake" | "donut" | "cake" | "loaf" | "baguette" | "milkbread";

export type Skill = "mix" | "shape" | "decorate" | "pack";
export type StationKind = "mixer" | "bench" | "decor" | "pack";
export type Stage = "mix" | "rest" | "shape" | "bake" | "cool" | "finish" | "done" | "scrapped";
export type PolicyId = "fifo" | "edf" | "smart";

export interface Ingredient {
  id: IngredientId;
  name: string;
  unit: "g" | "ml" | "pc";
  costPerUnit: number; // $ per unit
}

export interface Recipe {
  id: ProductId;
  name: string;
  sprite: string;
  color: string;
  perTray: number;
  ingredientsPerUnit: Partial<Record<IngredientId, number>>;
  mixBase: number; mixPerTray: number;
  restMin: number;        // dough rest / bulk proof (0 for batters)
  proofWindow: number;    // max minutes after rest before it must be in the oven
  shapePerTray: number;
  bakeTemp: number; bakeMin: number;
  coolMin: number;
  finishSkill: "decorate" | "pack";
  finishPerTray: number;
}

export interface WorkerDef {
  id: string; name: string; sprite: string; role: string;
  skills: Skill[]; speed: number; shift: [number, number];
}
export interface StationDef { id: string; name: string; kind: StationKind }
export interface OvenDef {
  id: string; name: string; capacity: number; startTemp: number;
  heatRate: number; coolRate: number; // °C per minute
  maintenance: { start: number; end: number }[];
}

export interface OrderDef {
  id: string; customer: string; product: ProductId; qty: number;
  releaseAt: number; deadline: number; vip?: boolean;
}

export type ScenarioEvent =
  | { at: number; kind: "delivery"; items: Partial<Record<IngredientId, number>>; label: string }
  | { at: number; kind: "ovenBreak"; ovenId: string; duration: number }
  | { at: number; kind: "workerOut"; workerId: string; duration: number }
  | { at: number; kind: "order"; order: OrderDef };

export interface Scenario {
  seed: number;
  dayLength: number;
  patience: number;          // minutes past deadline before a customer cancels
  maxLotTrays: number;
  doughRackTrays: number;
  coolRackTrays: number;
  ingredients: Ingredient[];
  recipes: Recipe[];
  workers: WorkerDef[];
  stations: StationDef[];
  ovens: OvenDef[];
  inventory: Record<IngredientId, number>;
  orders: OrderDef[];
  events: ScenarioEvent[];
}

// ---------- runtime state ----------

export interface Lot {
  id: string; orderId: string; product: ProductId;
  trays: number; units: number;
  stage: Stage; running: boolean;
  since: number;               // when it entered current wait/run state
  endsAt: number | null;
  restEnd: number | null;
  workerId: string | null; stationId: string | null; ovenId: string | null;
  consumed: boolean; attempts: number;
  blocked: string | null;      // why it's waiting (for the UI)
  bakedInOven: boolean;        // finished baking but stuck in oven (cool rack full)
}

export type OrderStatus = "queued" | "active" | "done" | "late" | "cancelled";
export interface Order extends OrderDef {
  status: OrderStatus; completedAt: number | null; lotIds: string[];
}

export interface WorkerState extends WorkerDef {
  lotId: string | null; stationId: string | null; busyUntil: number; outUntil: number;
}
export interface StationState extends StationDef { lotId: string | null }
export type OvenStatus = "idle" | "heating" | "baking" | "blocked" | "maintenance" | "broken" | "holding";
export interface OvenState extends OvenDef {
  temp: number; targetTemp: number | null; status: OvenStatus;
  lotIds: string[]; brokenUntil: number; batchStartedAt: number | null;
  heatFrom: number; heatStart: number; heatDoneAt: number;
}

export interface Interval {
  resource: string; start: number; end: number; lotId: string | null;
  label: string; color: string; kind: "work" | "bake" | "heat" | "down" | "ruined";
}

export interface WasteEvent {
  t: number; reason: "overproof" | "breakdown" | "cancelled" | "spoiled";
  product: ProductId; units: number; cost: number; lotId: string;
}

export interface LogEntry { t: number; level: "info" | "warn" | "bad" | "good"; msg: string }

export interface Counters {
  workerBusy: Record<string, number>; workerIdle: Record<string, number>;
  ovenBake: Record<string, number>; ovenHeat: Record<string, number>; ovenIdle: Record<string, number>;
  ovenIdleWithWork: Record<string, number>; ovenBlocked: Record<string, number>; ovenDown: Record<string, number>;
  ovenTrayMinutes: Record<string, number>; ovenCapMinutes: Record<string, number>;
  stationBusy: Record<string, number>;
  changeovers: number; batches: number;
  shortageLotMinutes: number; overproofs: number;
  wasteByIngredient: Partial<Record<IngredientId, number>>;
  series: { t: number; wip: number; done: number; late: number; waste: number; queue: number }[];
}

export interface SimState {
  scenario: Scenario; policy: PolicyId; now: number;
  lots: Record<string, Lot>; lotOrder: string[];
  orders: Record<string, Order>; orderOrder: string[];
  workers: WorkerState[]; stations: StationState[]; ovens: OvenState[];
  inventory: Record<IngredientId, number>;
  pending: ScenarioEvent[];     // future events, sorted by time
  intervals: Interval[];
  waste: WasteEvent[];
  log: LogEntry[];
  c: Counters;
  seq: number;
  finished: boolean;
}

export interface Summary {
  policy: PolicyId; seed: number;
  orders: number; ordersDone: number; ordersOnTime: number; ordersLate: number; ordersCancelled: number;
  onTimePct: number; avgLatenessMin: number; maxLatenessMin: number;
  unitsDone: number; throughputUnitsPerHr: number; ordersPerHr: number; makespan: number;
  workerUtilPct: number; workerIdleMin: number;
  ovenUtilPct: number; ovenIdleMin: number; ovenIdleWithWorkMin: number; ovenFillPct: number;
  changeovers: number; batches: number;
  wasteCost: number; wasteUnits: number; overproofs: number; shortageLotMinutes: number;
  wasteByIngredient: Partial<Record<IngredientId, number>>;
}
