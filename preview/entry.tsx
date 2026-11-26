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
import cafeClover from "@/public/sprites/clover-cafe.webp"; import cafeHoppy from "@/public/sprites/hoppy-hotel.webp"; import cafeMaple from "@/public/sprites/maple-school.webp";
import cafeMoon from "@/public/sprites/moon-library.webp"; import cafePuddle from "@/public/sprites/puddle-tea.webp"; import cafeSunny from "@/public/sprites/sunny-deli.webp";
import kitChecklist from "@/public/sprites/kit/checklist.webp";
import kitStandMixer from "@/public/sprites/kit/stand-mixer.webp";
import kitMixingBowl from "@/public/sprites/kit/mixing-bowl.webp";
import kitRollingPin from "@/public/sprites/kit/rolling-pin.webp";
import kitBakingTray from "@/public/sprites/kit/baking-tray.webp";
import kitBreadShelf from "@/public/sprites/kit/bread-shelf.webp";
import kitBreadBasket from "@/public/sprites/kit/bread-basket.webp";
import kitReceiptSmall from "@/public/sprites/kit/receipt-small.webp";
import kitBell from "@/public/sprites/kit/bell.webp";
import kitBadgeGold from "@/public/sprites/kit/badge-gold.webp";
import kitBadgePink from "@/public/sprites/kit/badge-pink.webp";
import loaf from "@/public/sprites/loaf.webp"; import baguette from "@/public/sprites/baguette.webp"; import sandwich from "@/public/sprites/sandwich.webp";

(globalThis as unknown as { __BAKERY_SPRITES: Record<string, string> }).__BAKERY_SPRITES = {
  bunny, bear, cat, chick, polar, scene, croissant, melon, roll, cupcake, donut, cake, loaf, baguette, sandwich,
  "clover-cafe": cafeClover, "hoppy-hotel": cafeHoppy, "maple-school": cafeMaple, "moon-library": cafeMoon, "puddle-tea": cafePuddle,   "kit/checklist": kitChecklist, "kit/stand-mixer": kitStandMixer, "kit/mixing-bowl": kitMixingBowl, "kit/rolling-pin": kitRollingPin, "kit/baking-tray": kitBakingTray, "kit/bread-shelf": kitBreadShelf, "kit/bread-basket": kitBreadBasket, "kit/receipt-small": kitReceiptSmall, "kit/bell": kitBell, "kit/badge-gold": kitBadgeGold, "kit/badge-pink": kitBadgePink,
  "sunny-deli": cafeSunny,
};
createRoot(document.getElementById("root")!).render(<BakeryApp />);