// Standalone single-file build (no server): sprites inlined, PostgreSQL features hidden.
import { createRoot } from "react-dom/client";
import BakeryApp from "@/components/BakeryApp";
import "@fontsource/zen-maru-gothic/latin-500.css";
import "@fontsource/zen-maru-gothic/latin-700.css";
import "@fontsource/mochiy-pop-one/latin-400.css";
import "@/app/globals.css";
import bunny from "@/public/sprites/bunny.webp"; import bear from "@/public/sprites/bear.webp"; import cat from "@/public/sprites/cat.webp";
import chick from "@/public/sprites/chick.webp"; import polar from "@/public/sprites/polar.webp"; import scene from "@/public/sprites/scene.webp";
import croissant from "@/public/sprites/croissant.webp"; import melon from "@/public/sprites/melon.webp"; import roll from "@/public/sprites/roll.webp";
import cupcake from "@/public/sprites/cupcake.webp"; import donut from "@/public/sprites/donut.webp"; import cake from "@/public/sprites/cake.webp";
import loaf from "@/public/sprites/loaf.webp"; import baguette from "@/public/sprites/baguette.webp"; import sandwich from "@/public/sprites/sandwich.webp";

(globalThis as unknown as { __BAKERY_SPRITES: Record<string, string> }).__BAKERY_SPRITES = {
  bunny, bear, cat, chick, polar, scene, croissant, melon, roll, cupcake, donut, cake, loaf, baguette, sandwich,
};
createRoot(document.getElementById("root")!).render(<BakeryApp />);