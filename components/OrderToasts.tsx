import { useEffect, useRef, useState } from "react";
import { cafeFor, clock, recipeOf, type SimState } from "@/lib/engine";
import { ACHIEVEMENTS } from "@/lib/achievements";
import { sprite } from "@/lib/sprites";

type Kind = "order" | "ready" | "badge";
interface Toast { key: string; kind: Kind; title: string; text: string; image: string; color: string; vip?: boolean }

const MAX_VISIBLE = 3;   // on screen at once; the rest wait their turn
const MAX_QUEUED = 9;    // at high speed, drop the oldest waiting ones rather than lag behind
const SHOW_MS = 4200;
const BADGE_COLOR = "#b8691b";

/**
 * Pop-up cards in the corner:
 *  - a café places an order  → their logo + a ringing bell
 *  - a café's order is done  → their logo + "Order ready"
 *  - an achievement unlocks  → a rosette badge
 */
export function OrderToasts({ s, unlocked, onShow }: { s: SimState; unlocked: string[]; onShow?: () => void }) {
  const seen = useRef(new Set<string>());
  const lastSim = useRef<SimState | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Runs after every render: look for things we haven't announced yet.
  useEffect(() => {
    if (lastSim.current !== s) { // the day was reset: start over
      lastSim.current = s;
      seen.current = new Set();
      setToasts([]);
    }
    const fresh: Toast[] = [];
    const once = (key: string, make: () => Toast | null) => {
      if (seen.current.has(key)) return;
      seen.current.add(key);
      const t = make();
      if (t) fresh.push(t);
    };
    for (const id of s.orderOrder) {
      const o = s.orders[id];
      const cafe = cafeFor(o.customer);
      if (!cafe) continue;
      const item = `${o.qty} ${recipeOf(s, o.product).name}`;
      once(`order:${id}`, () => ({
        key: `order:${id}`, kind: "order", title: cafe.name, image: cafe.logo, color: cafe.color, vip: !!o.vip,
        text: `${item}, due ${clock(o.deadline)}`,
      }));
      if (o.completedAt != null) once(`ready:${id}`, () => ({
        key: `ready:${id}`, kind: "ready", title: cafe.name, image: cafe.logo, color: cafe.color,
        text: o.status === "done" ? `${item}, on time` : `${item}, ${o.completedAt! - o.deadline} min late`,
      }));
    }
    for (const id of unlocked) {
      const a = ACHIEVEMENTS.find((x) => x.id === id);
      if (a) once(`badge:${id}`, () => ({ key: `badge:${id}`, kind: "badge", title: a.name, text: a.desc, image: a.badge, color: BADGE_COLOR }));
    }
    if (fresh.length) setToasts((t) => {
      const all = [...t, ...fresh];
      const showing = all.slice(0, MAX_VISIBLE), waiting = all.slice(MAX_VISIBLE);
      // achievements go to the front of the line and are never dropped; orders are trimmed oldest-first
      const badges = waiting.filter((x) => x.kind === "badge");
      const rest = waiting.filter((x) => x.kind !== "badge").slice(-Math.max(0, MAX_QUEUED - MAX_VISIBLE - badges.length));
      return [...showing, ...badges, ...rest];
    });
  });

  const dismiss = (key: string) => setToasts((t) => t.filter((x) => x.key !== key));

  return (
    <div className="toasts" aria-live="polite">
      {toasts.slice(0, MAX_VISIBLE).map((t) => (
        <ToastCard key={t.key} t={t} onShow={t.kind === "order" ? onShow : undefined} onDone={() => dismiss(t.key)} />
      ))}
    </div>
  );
}

const KICKER: Record<Kind, { label: string; icon: string }> = {
  order: { label: "New order", icon: "kit/bell" },
  ready: { label: "Order ready", icon: "kit/bread-basket" },
  badge: { label: "Achievement", icon: "" },
};

function ToastCard({ t, onShow, onDone }: { t: Toast; onShow?: () => void; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    onShow?.(); // a new-order card just appeared: let a baker answer
    const a = setTimeout(() => setLeaving(true), SHOW_MS);
    const b = setTimeout(onDone, SHOW_MS + 350);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const k = KICKER[t.kind];
  return (
    <div className={`toast ${t.kind} ${leaving ? "leaving" : ""}`} style={{ ["--accent" as string]: t.color }}>
      <img className="toast-logo" src={sprite(t.image)} alt="" />
      <div className="toast-body">
        <div className="toast-kicker">
          {k.icon && <img className="toast-icon" src={sprite(k.icon)} alt="" />}
          {k.label}{t.vip && <em className="vip">VIP</em>}
        </div>
        <div className="toast-name">{t.title}</div>
        <div className="toast-text">{t.text}</div>
      </div>
      <button className="toast-x" onClick={() => { setLeaving(true); setTimeout(onDone, 300); }} aria-label="Dismiss">×</button>
    </div>
  );
}