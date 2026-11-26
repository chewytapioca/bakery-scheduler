import { INGREDIENTS, OVENS, RECIPES, START_INVENTORY, STATIONS, WORKERS } from "./catalog";
import type { OrderDef, ProductId, Recipe, Scenario, ScenarioEvent } from "./types";

/** Shortest possible door-to-door time for a 2-tray lot with no queueing. */
export const criticalPath = (r: Recipe, trays = 2) =>
  r.mixBase + r.mixPerTray * trays + r.restMin + r.shapePerTray * trays + r.bakeMin + r.coolMin + r.finishPerTray * trays;

/** Small deterministic PRNG so every policy sees the exact same day. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Wholesale customers. `logo` is a sprite name (public/sprites/<logo>.webp), `color` is the logo's ink colour. */
export const CAFES = [
  { name: "Clover Café", logo: "clover-cafe", color: "#7f9a3e" },
  { name: "Hoppy Hotel", logo: "hoppy-hotel", color: "#9c8a83" },
  { name: "Maple School", logo: "maple-school", color: "#c9502a" },
  { name: "Puddle Tea House", logo: "puddle-tea", color: "#6f92b3" },
  { name: "Sunny Deli", logo: "sunny-deli", color: "#d9782c" },
  { name: "Moon Library Café", logo: "moon-library", color: "#7f6d47" },
] as const;
export type Cafe = (typeof CAFES)[number];

/** Find the café behind an order's customer name (works for orders loaded from the database too). */
export const cafeFor = (customer: string): Cafe | undefined => CAFES.find((c) => c.name === customer);
const PEOPLE = ["Mrs. Hazel", "Little Pip", "Mr. Otter", "Nana Fern", "Juniper", "Biscuit", "Captain Toast", "Miso", "Dr. Waffles", "Pebble", "Lulu", "Clementine"];

const QTY: Record<ProductId, [number, number, number]> = {
  // [min, max, step]
  croissant: [12, 36, 6], melon: [10, 30, 5], roll: [16, 48, 8], cupcake: [6, 24, 6], donut: [6, 24, 6],
  cake: [1, 3, 1], loaf: [2, 8, 2], baguette: [4, 12, 2], milkbread: [2, 6, 1],
};

export function makeScenario(seed = 7): Scenario {
  const rnd = mulberry32(seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const qty = (p: ProductId) => {
    const [lo, hi, st] = QTY[p];
    return lo + st * Math.floor(rnd() * ((hi - lo) / st + 1));
  };
  const products = RECIPES.map((r) => r.id);
  const rec = (p: ProductId) => RECIPES.find((r) => r.id === p)!;
  const roundUp = (t: number) => Math.ceil(t / 15) * 15;
  const orders: OrderDef[] = [];
  let n = 0;
  const id = () => `O${String(++n).padStart(2, "0")}`;

  // Wholesale pre-orders: known at open, due during the morning rush.
  for (let i = 0; i < 9; i++) {
    const p = pick(["croissant", "roll", "baguette", "loaf", "melon", "milkbread", "croissant"] as ProductId[]);
    orders.push({ id: id(), customer: pick([...CAFES]).name, product: p, qty: qty(p) + (p === "croissant" ? 12 : 0),
      releaseAt: 0, deadline: roundUp(criticalPath(rec(p)) + 30 + rnd() * 90), vip: i < 2 });
  }
  // Custom & walk-in orders through the day.
  for (let i = 0; i < 27; i++) {
    const p = pick(products);
    const releaseAt = 20 + Math.round(rnd() * 360);
    const lead = criticalPath(rec(p)) + 20 + rnd() * 100;
    orders.push({ id: id(), customer: pick(PEOPLE), product: p, qty: qty(p), releaseAt, deadline: roundUp(releaseAt + lead), vip: rnd() < 0.12 });
  }
  orders.sort((a, b) => a.releaseAt - b.releaseAt || a.deadline - b.deadline);

  const events: ScenarioEvent[] = [
    { at: 240, kind: "delivery", label: "Dairy truck", items: { butter: 6000, milk: 8000, cream: 4000, eggs: 60 } },
    { at: 300, kind: "delivery", label: "Mill delivery", items: { flour: 30000, sugar: 5000, yeast: 400 } },
    { at: 330, kind: "delivery", label: "Farm stand", items: { strawberry: 60 } },
  ];

  return {
    seed, dayLength: 600, patience: 90, maxLotTrays: 2, doughRackTrays: 16, coolRackTrays: 12,
    ingredients: INGREDIENTS, recipes: RECIPES, workers: WORKERS, stations: STATIONS, ovens: OVENS,
    inventory: { ...START_INVENTORY }, orders, events,
  };
}

export const clock = (t: number) => {
  const m = 300 + Math.round(t);
  const h = Math.floor(m / 60) % 24;
  return `${h}:${String(m % 60).padStart(2, "0")}`;
};