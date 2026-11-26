import type { Ingredient, OvenDef, Recipe, StationDef, WorkerDef, IngredientId } from "./types";

export const INGREDIENTS: Ingredient[] = [
  { id: "flour", name: "Flour", unit: "g", costPerUnit: 0.0018 },
  { id: "butter", name: "Butter", unit: "g", costPerUnit: 0.012 },
  { id: "sugar", name: "Sugar", unit: "g", costPerUnit: 0.0015 },
  { id: "eggs", name: "Eggs", unit: "pc", costPerUnit: 0.35 },
  { id: "milk", name: "Milk", unit: "ml", costPerUnit: 0.0012 },
  { id: "yeast", name: "Yeast", unit: "g", costPerUnit: 0.02 },
  { id: "cream", name: "Cream", unit: "ml", costPerUnit: 0.006 },
  { id: "strawberry", name: "Strawberries", unit: "pc", costPerUnit: 0.25 },
];

const r = (x: Omit<Recipe, "mixBase" | "mixPerTray"> & Partial<Pick<Recipe, "mixBase" | "mixPerTray">>): Recipe =>
  ({ mixBase: 10, mixPerTray: 4, ...x });

export const RECIPES: Recipe[] = [
  r({ id: "croissant", name: "Croissant", sprite: "croissant", color: "#e9a75a", perTray: 12,
    ingredientsPerUnit: { flour: 60, butter: 35, sugar: 6, milk: 20, yeast: 2, eggs: 0.1 },
    restMin: 45, proofWindow: 35, shapePerTray: 10, bakeTemp: 200, bakeMin: 18, coolMin: 15, finishSkill: "pack", finishPerTray: 3 }),
  r({ id: "melon", name: "Melon pan", sprite: "melon", color: "#f2c94c", perTray: 10,
    ingredientsPerUnit: { flour: 55, butter: 10, sugar: 25, eggs: 0.2, milk: 15, yeast: 2 },
    restMin: 40, proofWindow: 30, shapePerTray: 9, bakeTemp: 180, bakeMin: 15, coolMin: 10, finishSkill: "pack", finishPerTray: 3 }),
  r({ id: "roll", name: "Dinner roll", sprite: "roll", color: "#d9925a", perTray: 16,
    ingredientsPerUnit: { flour: 50, butter: 6, sugar: 4, milk: 25, yeast: 2 },
    restMin: 35, proofWindow: 40, shapePerTray: 7, bakeTemp: 180, bakeMin: 14, coolMin: 10, finishSkill: "pack", finishPerTray: 2 }),
  r({ id: "cupcake", name: "Cupcake", sprite: "cupcake", color: "#f4a6b8", perTray: 12,
    ingredientsPerUnit: { flour: 30, butter: 20, sugar: 25, eggs: 0.5, milk: 15, cream: 25 },
    restMin: 0, proofWindow: 45, shapePerTray: 4, bakeTemp: 180, bakeMin: 20, coolMin: 20, finishSkill: "decorate", finishPerTray: 8 }),
  r({ id: "donut", name: "Baked donut", sprite: "donut", color: "#ee8fb0", perTray: 12,
    ingredientsPerUnit: { flour: 40, butter: 10, sugar: 20, eggs: 0.3, milk: 20, yeast: 1 },
    restMin: 30, proofWindow: 30, shapePerTray: 8, bakeTemp: 180, bakeMin: 12, coolMin: 10, finishSkill: "decorate", finishPerTray: 7 }),
  r({ id: "cake", name: "Strawberry cake", sprite: "cake", color: "#e8708a", perTray: 2,
    ingredientsPerUnit: { flour: 250, butter: 120, sugar: 200, eggs: 4, milk: 100, cream: 300, strawberry: 10 },
    restMin: 0, proofWindow: 40, shapePerTray: 6, bakeTemp: 170, bakeMin: 40, coolMin: 30, finishSkill: "decorate", finishPerTray: 15 }),
  r({ id: "loaf", name: "Sourdough loaf", sprite: "loaf", color: "#b9773f", perTray: 4,
    ingredientsPerUnit: { flour: 500, yeast: 3 }, mixBase: 15, mixPerTray: 5,
    restMin: 90, proofWindow: 45, shapePerTray: 12, bakeTemp: 230, bakeMin: 35, coolMin: 30, finishSkill: "pack", finishPerTray: 2 }),
  r({ id: "baguette", name: "Baguette", sprite: "baguette", color: "#cf8a45", perTray: 6,
    ingredientsPerUnit: { flour: 250, yeast: 2 },
    restMin: 60, proofWindow: 35, shapePerTray: 10, bakeTemp: 230, bakeMin: 25, coolMin: 15, finishSkill: "pack", finishPerTray: 2 }),
  r({ id: "milkbread", name: "Milk bread", sprite: "sandwich", color: "#e0a86a", perTray: 3,
    ingredientsPerUnit: { flour: 400, milk: 200, butter: 40, sugar: 30, yeast: 6, eggs: 1 },
    restMin: 60, proofWindow: 40, shapePerTray: 10, bakeTemp: 200, bakeMin: 30, coolMin: 25, finishSkill: "pack", finishPerTray: 3 }),
];

export const WORKERS: WorkerDef[] = [
  { id: "momo", name: "Momo", sprite: "bunny", role: "Head baker", skills: ["mix", "shape", "decorate"], speed: 1.2, shift: [0, 480] },
  { id: "kuma", name: "Kuma", sprite: "bear", role: "Dough lead", skills: ["mix", "shape"], speed: 1.0, shift: [0, 600] },
  { id: "mochi", name: "Mochi", sprite: "cat", role: "Pastry", skills: ["shape", "decorate", "pack"], speed: 1.0, shift: [60, 600] },
  { id: "piyo", name: "Piyo", sprite: "chick", role: "Apprentice", skills: ["decorate", "pack"], speed: 0.7, shift: [120, 540] },
  { id: "shiro", name: "Shiro", sprite: "polar", role: "Early shift", skills: ["mix", "shape", "pack"], speed: 1.0, shift: [0, 420] },
];

export const STATIONS: StationDef[] = [
  { id: "mixer1", name: "Mixer A", kind: "mixer" },
  { id: "mixer2", name: "Mixer B", kind: "mixer" },
  { id: "bench1", name: "Bench 1", kind: "bench" },
  { id: "bench2", name: "Bench 2", kind: "bench" },
  { id: "decor", name: "Decor table", kind: "decor" },
  { id: "pack", name: "Counter", kind: "pack" },
];

export const OVENS: OvenDef[] = [
  { id: "brick", name: "Bunny brick oven", capacity: 4, startTemp: 200, heatRate: 8, coolRate: 3, maintenance: [] },
  { id: "deck", name: "Deck oven", capacity: 3, startTemp: 180, heatRate: 10, coolRate: 4, maintenance: [{ start: 300, end: 330 }] },
  { id: "convect", name: "Convection", capacity: 2, startTemp: 180, heatRate: 12, coolRate: 5, maintenance: [] },
];

export const START_INVENTORY: Record<IngredientId, number> = {
  flour: 60000, butter: 9000, sugar: 9000, eggs: 110, milk: 14000, yeast: 900, cream: 6000, strawberry: 80,
};

export const SKILL_FOR: Record<"mix" | "shape" | "finish", (rec: Recipe) => import("./types").Skill> = {
  mix: () => "mix", shape: () => "shape", finish: (rec) => rec.finishSkill,
};
export const STATION_FOR: Record<"mix" | "shape" | "finish", (rec: Recipe) => import("./types").StationKind> = {
  mix: () => "mixer", shape: () => "bench", finish: (rec) => (rec.finishSkill === "decorate" ? "decor" : "pack"),
};
