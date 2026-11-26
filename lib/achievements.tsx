import type { SimState } from "./engine";

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  badge: "kit/badge-gold" | "kit/badge-pink";
  /** True once the bakery has earned it. Checked every frame against the live state. */
  earned: (s: SimState) => boolean;
}

const orders = (s: SimState) => s.orderOrder.map((id) => s.orders[id]);

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: "first", name: "First basket out", desc: "Finish your first order",
    badge: "kit/badge-gold",
    earned: (s) => orders(s).some((o) => o.completedAt != null),
  },
  {
    id: "full-oven", name: "Full oven", desc: "Bake with every tray slot filled",
    badge: "kit/badge-pink",
    earned: (s) => s.ovens.some((o) => o.status === "baking" &&
      o.lotIds.reduce((a, id) => a + s.lots[id].trays, 0) === o.capacity),
  },
  {
    id: "vip", name: "VIP treatment", desc: "Deliver a VIP order on time",
    badge: "kit/badge-pink",
    earned: (s) => orders(s).some((o) => o.vip && o.status === "done"),
  },
  {
    id: "morning", name: "Morning rush", desc: "Every opening café order on time",
    badge: "kit/badge-gold",
    earned: (s) => {
      const opening = orders(s).filter((o) => o.releaseAt === 0);
      return opening.length > 0 && opening.every((o) => o.status === "done");
    },
  },
  {
    id: "ten", name: "Ten on time", desc: "Ten orders delivered on time",
    badge: "kit/badge-gold",
    earned: (s) => orders(s).filter((o) => o.status === "done").length >= 10,
  },
  {
    id: "tidy", name: "Tidy kitchen", desc: "Reach noon without wasting anything",
    badge: "kit/badge-pink",
    earned: (s) => s.now >= 420 && s.waste.length === 0, // t = 420 is 12:00
  },
  {
    id: "rescue", name: "Rush rescue", desc: "Finish a rush order on time",
    badge: "kit/badge-pink",
    earned: (s) => orders(s).some((o) => o.id.startsWith("R") && o.status === "done"),
  },
];