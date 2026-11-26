import { useEffect, useRef, useState } from "react";
import { cafeFor, clock, recipeOf, type SimState } from "@/lib/engine";
import { sprite } from "@/lib/sprites";

interface Toast { id: string; name: string; logo: string; color: string; text: string; due: string; vip: boolean }

const MAX_VISIBLE = 3;   // on screen at once; the rest wait their turn
const MAX_QUEUED = 9;    // at high speed, drop the oldest waiting ones rather than lag behind
const SHOW_MS = 4200;

/** Pops up a café's logo card whenever one of the wholesale cafés places an order. */
export function OrderToasts({ s }: { s: SimState }) {
  const seen = useRef(new Set<string>());
  const lastSim = useRef<SimState | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Runs after every render: look for orders we haven't announced yet.
  useEffect(() => {
    if (lastSim.current !== s) { // the day was reset: start over
      lastSim.current = s;
      seen.current = new Set();
      setToasts([]);
    }
    const fresh: Toast[] = [];
    for (const id of s.orderOrder) {
      if (seen.current.has(id)) continue;
      seen.current.add(id);
      const o = s.orders[id];
      const cafe = cafeFor(o.customer);
      if (!cafe) continue;
      fresh.push({
        id, name: cafe.name, logo: cafe.logo, color: cafe.color, vip: !!o.vip,
        text: `${o.qty} ${recipeOf(s, o.product).name}`, due: clock(o.deadline),
      });
    }
    if (fresh.length) setToasts((t) => {
      const all = [...t, ...fresh];
      // keep the ones already showing, trim the oldest of the waiting ones
      const showing = all.slice(0, MAX_VISIBLE), waiting = all.slice(MAX_VISIBLE);
      return [...showing, ...waiting.slice(-(MAX_QUEUED - MAX_VISIBLE))];
    });
  });

  const dismiss = (id: string) => setToasts((t) => t.filter((x) => x.id !== id));

  return (
    <div className="toasts" aria-live="polite">
      {toasts.slice(0, MAX_VISIBLE).map((t) => <ToastCard key={t.id} t={t} onDone={() => dismiss(t.id)} />)}
    </div>
  );
}

function ToastCard({ t, onDone }: { t: Toast; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const a = setTimeout(() => setLeaving(true), SHOW_MS);
    const b = setTimeout(onDone, SHOW_MS + 350);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`toast ${leaving ? "leaving" : ""}`} style={{ ["--accent" as string]: t.color }}>
      <img className="toast-logo" src={sprite(t.logo)} alt={`${t.name} logo`} />
      <div className="toast-body">
        <div className="toast-kicker">New order{t.vip && <em className="vip">VIP</em>}</div>
        <div className="toast-name">{t.name}</div>
        <div className="toast-text">{t.text}, due {t.due}</div>
      </div>
      <button className="toast-x" onClick={() => { setLeaving(true); setTimeout(onDone, 300); }} aria-label="Dismiss">×</button>
    </div>
  );
}