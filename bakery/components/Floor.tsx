import { useLayoutEffect, useRef, useState } from "react";
import {
  clock, coolRackUse, doughRackUse, lotSlack, proofSlack, recipeOf, type IngredientId, type Lot, type SimState,
} from "@/lib/engine";
import { sprite } from "@/lib/sprites";

/** FLIP animation: lot cards glide from one pipeline column to the next. */
function useFlip(ref: React.RefObject<HTMLDivElement | null>) {
  const prev = useRef(new Map<string, { x: number; y: number }>());
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const next = new Map<string, { x: number; y: number }>();
    root.querySelectorAll<HTMLElement>("[data-flip]").forEach((n) => {
      // offsetLeft/Top ignore transforms, so an in-flight animation never feeds back into the next measurement
      const pos = { x: n.offsetLeft, y: n.offsetTop };
      const k = n.dataset.flip!;
      next.set(k, pos);
      const p = prev.current.get(k);
      if (!p) n.animate([{ opacity: 0, transform: "scale(.7)" }, { opacity: 1, transform: "none" }], { duration: 350, easing: "ease-out" });
      else if (Math.abs(p.x - pos.x) > 30) // only animate column changes, not reshuffles within a column
        n.animate([{ transform: `translate(${p.x - pos.x}px, ${p.y - pos.y}px)` }, { transform: "none" }],
          { duration: 600, easing: "cubic-bezier(.2,.8,.2,1)" });
    });
    prev.current = next;
  });
}

const COLS: { id: string; title: string; icon: string; match: (l: Lot) => boolean }[] = [
  { id: "queue", title: "Queue", icon: "📋", match: (l) => l.stage === "mix" && !l.running },
  { id: "mix", title: "Mixing", icon: "🥣", match: (l) => l.stage === "mix" && l.running },
  { id: "rest", title: "Resting", icon: "💤", match: (l) => l.stage === "rest" },
  { id: "shape", title: "Shaping", icon: "🫓", match: (l) => l.stage === "shape" },
  { id: "bake", title: "Oven", icon: "🔥", match: (l) => l.stage === "bake" },
  { id: "cool", title: "Cooling", icon: "🌬️", match: (l) => l.stage === "cool" },
  { id: "finish", title: "Decorate & pack", icon: "🎀", match: (l) => l.stage === "finish" },
];

const MAX_CARDS = 8;

function slackTone(slack: number) {
  return slack < 0 ? "late" : slack < 30 ? "tight" : "ok";
}

function LotCard({ s, l }: { s: SimState; l: Lot }) {
  const rec = recipeOf(s, l.product);
  const o = s.orders[l.orderId];
  const slack = Math.round(lotSlack(s, l));
  const ps = proofSlack(s, l);
  let pct = 0;
  if (l.running && l.endsAt != null) {
    const total = Math.max(1, l.endsAt - l.since);
    pct = Math.min(100, (100 * (s.now - l.since)) / total);
  }
  const who = l.workerId ? s.workers.find((w) => w.id === l.workerId) : null;
  const status = l.running
    ? l.ovenId && l.endsAt == null ? "pre-heating" : l.endsAt != null ? `${l.endsAt - s.now} min left` : ""
    : l.blocked ?? "ready";
  return (
    <div className={`lot ${slackTone(slack)} ${l.blocked?.startsWith("Short") ? "short" : ""}`} data-flip={l.id}
      title={`${o.customer} · ${o.qty} ${rec.name} · due ${clock(o.deadline)} · slack ${slack} min`}>
      <img src={sprite(rec.sprite)} alt="" />
      <div className="lot-body">
        <div className="lot-top"><b>{l.units}</b> {rec.name}{o.vip && " ⭐"}</div>
        <div className="lot-meta">
          {l.orderId} · {l.trays} tray{l.trays > 1 ? "s" : ""}{l.attempts ? ` · retry ${l.attempts}` : ""}
          {who && <img className="mini-who" src={sprite(who.sprite)} alt={who.name} title={who.name} />}
        </div>
        {l.running && l.endsAt != null && <div className="bar"><i style={{ width: `${pct}%` }} /></div>}
        <div className={`lot-status ${!l.running && l.blocked ? "blocked" : ""}`}>
          {ps < 15 && ps !== Infinity ? <span className="proof">⏳ proof {Math.max(0, Math.round(ps))}m · </span> : null}{status}
        </div>
      </div>
      <span className={`slack ${slackTone(slack)}`}>{slack >= 0 ? `+${slack}` : slack}</span>
    </div>
  );
}

export function Floor({ s, disrupt }: {
  s: SimState;
  disrupt: { breakOven: (id: string) => void; workerOut: (id: string) => void; delay: () => void; spill: () => void; rush: () => void };
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFlip(ref);
  const lots = s.lotOrder.map((id) => s.lots[id]);
  const done = lots.filter((l) => l.stage === "done");
  const [ovenPick, setOvenPick] = useState(s.ovens[0].id);
  const [workerPick, setWorkerPick] = useState(s.workers[1].id);
  const dRack = doughRackUse(s), cRack = coolRackUse(s);

  return (
    <div className="floor">
      <div className="card pipeline-card">
        <div className="card-h">
          <h2>Production pipeline</h2>
          <div className="racks">
            <span className={dRack >= s.scenario.doughRackTrays ? "full" : ""}>Dough rack {dRack}/{s.scenario.doughRackTrays} trays</span>
            <span className={cRack >= s.scenario.coolRackTrays ? "full" : ""}>Cooling rack {cRack}/{s.scenario.coolRackTrays}</span>
            <span className="legend-slack"><i className="ok" />on track <i className="tight" />&lt;30 min slack <i className="late" />behind</span>
          </div>
        </div>
        <div className="pipeline" ref={ref}>
          {COLS.map((c) => {
            const items = lots.filter(c.match);
            return (
              <div className="col" key={c.id}>
                <div className="col-h">{c.icon} {c.title} <span className="count">{items.length}</span></div>
                <div className="col-body">
                  {items.slice(0, MAX_CARDS).map((l) => <LotCard key={l.id} s={s} l={l} />)}
                  {items.length > MAX_CARDS && <div className="more">+{items.length - MAX_CARDS} more</div>}
                </div>
              </div>
            );
          })}
          <div className="col done-col">
            <div className="col-h">✅ Done <span className="count">{done.length}</span></div>
            <div className="col-body done-pile">
              {done.slice(-24).map((l) => <img key={l.id} data-flip={l.id} src={sprite(recipeOf(s, l.product).sprite)} alt="" title={`${l.units} ${recipeOf(s, l.product).name}`} />)}
            </div>
          </div>
        </div>
      </div>

      <div className="grid3">
        <div className="card">
          <div className="card-h"><h2>Ovens</h2></div>
          <div className="ovens">
            {s.ovens.map((o) => {
              const inOven = o.lotIds.map((id) => s.lots[id]);
              const ends = inOven.map((l) => l.endsAt).filter((x): x is number => x != null);
              const left = ends.length ? Math.max(...ends) - s.now : null;
              const nextM = o.maintenance.find((m) => m.end > s.now);
              const label = { idle: "Idle", heating: o.targetTemp != null && o.targetTemp < o.temp ? "Cooling down" : "Heating", baking: "Baking", blocked: "Blocked – cooling rack full", maintenance: "Maintenance", broken: "Broken!", holding: "Holding for fuller batch" }[o.status];
              const slots: Lot[] = [];
              for (const l of inOven) for (let i = 0; i < l.trays; i++) slots.push(l);
              return (
                <div key={o.id} className={`oven ${o.status}`}>
                  <div className="oven-top">
                    <div>
                      <div className="oven-name">{o.name}</div>
                      <div className={`chip st-${o.status}`}>{label}</div>
                    </div>
                    <div className="temp">
                      <b>{o.temp}°</b>
                      {o.targetTemp != null && o.targetTemp !== o.temp && <small>→{o.targetTemp}°</small>}
                    </div>
                  </div>
                  <div className="trays">
                    {Array.from({ length: o.capacity }).map((_, i) => {
                      const l = slots[i];
                      return <div key={i} className={`tray ${l ? "full" : ""}`}>{l && <img src={sprite(recipeOf(s, l.product).sprite)} alt="" />}</div>;
                    })}
                  </div>
                  <div className="oven-foot">
                    {left != null && o.status === "baking" ? `${left} min left` : o.status === "broken" ? `back at ${clock(o.brokenUntil)}` : nextM ? `maintenance ${clock(nextM.start)}–${clock(nextM.end)}` : `${o.capacity} trays`}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div className="card-h"><h2>Bakers</h2></div>
          <div className="bakers">
            {s.workers.map((w) => {
              const l = w.lotId ? s.lots[w.lotId] : null;
              const onShift = s.now >= w.shift[0] && s.now < w.shift[1];
              const out = w.outUntil > s.now;
              const busy = s.c.workerBusy[w.id], idle = s.c.workerIdle[w.id];
              const st = out ? "out" : !onShift ? "off" : l ? "busy" : "idle";
              const verb = l ? { mix: "Mixing", shape: "Shaping", finish: recipeOf(s, l.product).finishSkill === "decorate" ? "Decorating" : "Packing" }[l.stage as "mix"] : "";
              return (
                <div key={w.id} className={`baker ${st}`}>
                  <img src={sprite(w.sprite)} alt="" className={st === "busy" ? "bob" : ""} />
                  <div className="baker-body">
                    <div className="baker-name">{w.name} <small>{w.role}{w.speed !== 1 ? ` · ${w.speed}× speed` : ""}</small></div>
                    <div className="baker-task">
                      {out ? `🤒 out until ${clock(w.outUntil)}` : !onShift ? `off shift (${clock(w.shift[0])}–${clock(w.shift[1])})`
                        : l ? `${verb} ${l.units} ${recipeOf(s, l.product).name} · ${w.busyUntil - s.now}m` : "idle"}
                    </div>
                    <div className="skills">{w.skills.map((k) => <span key={k}>{k}</span>)}<span className="util">{busy + idle ? Math.round((100 * busy) / (busy + idle)) : 0}% busy</span></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div className="card-h"><h2>Pantry</h2></div>
          <Pantry s={s} />
        </div>
      </div>

      <div className="grid2">
        <div className="card">
          <div className="card-h"><h2>Throw a wrench in it</h2></div>
          <p className="muted">Disruptions hit the live state; the scheduler re-plans on the next minute.</p>
          <div className="wrenches">
            <div className="wrench">
              <select value={ovenPick} onChange={(e) => setOvenPick(e.target.value)}>{s.ovens.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
              <button className="btn" onClick={() => disrupt.breakOven(ovenPick)} disabled={s.finished}>🔥 Break oven (45 min)</button>
            </div>
            <div className="wrench">
              <select value={workerPick} onChange={(e) => setWorkerPick(e.target.value)}>{s.workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
              <button className="btn" onClick={() => disrupt.workerOut(workerPick)} disabled={s.finished}>🤒 Baker out (90 min)</button>
            </div>
            <button className="btn" onClick={disrupt.delay} disabled={s.finished || !s.pending.some((e) => e.kind === "delivery")}>🐢 Delay next delivery 2h</button>
            <button className="btn" onClick={disrupt.spill} disabled={s.finished}>💥 Spill 40% of flour</button>
            <button className="btn" onClick={disrupt.rush} disabled={s.finished}>⭐ Rush VIP order</button>
          </div>
        </div>
        <div className="card">
          <div className="card-h"><h2>Event log</h2></div>
          <ul className="log">
            {[...s.log].reverse().slice(0, 60).map((e, i) => (
              <li key={s.log.length - i} className={e.level}><time>{clock(e.t)}</time>{e.msg}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Pantry({ s }: { s: SimState }) {
  // demand from lots not yet mixed
  const need: Partial<Record<IngredientId, number>> = {};
  for (const id of s.lotOrder) {
    const l = s.lots[id];
    if (l.consumed || l.stage !== "mix") continue;
    for (const [k, q] of Object.entries(recipeOf(s, l.product).ingredientsPerUnit)) need[k as IngredientId] = (need[k as IngredientId] ?? 0) + q! * l.units;
  }
  const next = s.pending.filter((e) => e.kind === "delivery");
  const fmtQ = (q: number, u: string) => (u === "g" || u === "ml") && q >= 1000 ? `${(q / 1000).toFixed(1)}${u === "g" ? "kg" : "L"}` : `${Math.round(q)}${u === "pc" ? "" : u}`;
  return (
    <div className="pantry">
      {s.scenario.ingredients.map((i) => {
        const have = s.inventory[i.id];
        const max = Math.max(s.scenario.inventory[i.id], have, need[i.id] ?? 0);
        const n = need[i.id] ?? 0;
        const short = n > have;
        return (
          <div key={i.id} className={`ing ${short ? "short" : ""}`}>
            <div className="ing-h"><span>{i.name}</span><span>{fmtQ(have, i.unit)}{short && <b> · short {fmtQ(n - have, i.unit)}</b>}</span></div>
            <div className="ing-bar">
              <i style={{ width: `${(100 * have) / max}%` }} />
              {n > 0 && <em style={{ left: `${Math.min(100, (100 * n) / max)}%` }} title={`queued orders need ${fmtQ(n, i.unit)}`} />}
            </div>
          </div>
        );
      })}
      <div className="deliveries">
        {next.length ? next.map((e, k) => e.kind === "delivery" && <div key={k}>🚚 {e.label} · {clock(e.at)}</div>) : <div className="muted">No more deliveries today</div>}
        <div className="muted small">Tick = demand from orders not yet mixed</div>
      </div>
    </div>
  );
}
