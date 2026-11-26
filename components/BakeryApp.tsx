"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  POLICIES, RECIPES, clock, createSim, criticalPath, delayDelivery, forecast, inject, makeScenario, spill, step,
  summarize, type PolicyId, type ProductId, type Scenario, type SimState,
} from "@/lib/engine";
import { sprite } from "@/lib/sprites";
import { Floor } from "./Floor";
import { Schedule } from "./Schedule";
import { Metrics } from "./Metrics";
import { Kpis } from "./Kpis";
import { OrderToasts } from "./OrderToasts";
import { ACHIEVEMENTS } from "@/lib/achievements";
import { Tappable } from "./Tappable";

const SPEEDS = [1, 5, 15, 40]; // simulated minutes per real second
type Tab = "floor" | "schedule" | "metrics";

export default function BakeryApp({ api = false }: { api?: boolean }) {
  const [seed, setSeed] = useState(7);
  const [policy, setPolicy] = useState<PolicyId>("smart");
  const [scenario, setScenario] = useState<Scenario>(() => makeScenario(7));
  const [source, setSource] = useState<"seed" | "postgres">("seed");
  const simRef = useRef<SimState>(createSim(structuredClone(scenario), policy));
  const [, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(15);
  const [tab, setTab] = useState<Tab>("floor");
  // Achievements earned today (cleared when the day is reset).
  const [unlocked, setUnlocked] = useState<string[]>([]);
  const achSim = useRef<SimState | null>(null);
  useEffect(() => {
    const sim = simRef.current;
    if (achSim.current !== sim) { achSim.current = sim; setUnlocked([]); return; }
    const fresh = ACHIEVEMENTS.filter((a) => !unlocked.includes(a.id) && a.earned(sim)).map((a) => a.id);
    if (fresh.length) setUnlocked((u) => [...u, ...fresh]);
  });

  // Each café pop-up gets its own baker who says "I'm on it!". cues[workerId] bumps when it's their turn.
  const [cues, setCues] = useState<Record<string, number>>({});
  const recentResponders = useRef<string[]>([]);
  const nextCueAt = useRef(0);
  const answerOrder = () => {
    const sim = simRef.current;
    const present = sim.workers.filter((w) => sim.now >= w.shift[0] && sim.now < w.shift[1] && w.outUntil <= sim.now);
    if (!present.length) return;
    // idle bakers first; skip whoever answered most recently so they take turns
    const ordered = [...present.filter((w) => !w.lotId), ...present.filter((w) => w.lotId)];
    const skip = recentResponders.current.slice(-(present.length - 1));
    const pick = ordered.find((w) => !skip.includes(w.id)) ?? ordered[0];
    recentResponders.current = [...recentResponders.current, pick.id].slice(-10);
    // several pop-ups at once: stagger the bubbles so each one is visible
    const now = performance.now();
    nextCueAt.current = Math.max(now, nextCueAt.current + 700);
    setTimeout(() => setCues((c) => ({ ...c, [pick.id]: (c[pick.id] ?? 0) + 1 })), nextCueAt.current - now);
  };
  const [version, setVersion] = useState(0); // bump when state changes outside normal ticks
  const carry = useRef(0);
  const s = simRef.current;
  const rerender = () => setFrame((f) => f + 1);

  // Load scenario from Postgres via the API when running inside Next.js
  useEffect(() => {
    if (!api) return;
    fetch(`/api/scenario?seed=${seed}`).then((r) => r.json()).then((d) => {
      if (!d.scenario) return;
      setScenario(d.scenario); setSource(d.source);
      simRef.current = createSim(structuredClone(d.scenario), policy); setVersion((v) => v + 1);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, seed]);

  const reset = useCallback((p: PolicyId = policy, sc: Scenario = scenario) => {
    simRef.current = createSim(structuredClone(sc), p);
    carry.current = 0; setVersion((v) => v + 1);
  }, [policy, scenario]);

  // animation loop
  useEffect(() => {
    if (!playing) return;
    let last = performance.now(), raf = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000); last = now;
      carry.current += dt * speed;
      let n = 0;
      while (carry.current >= 1 && n < 60) { step(simRef.current); carry.current -= 1; n++; }
      if (n) rerender();
      if (simRef.current.finished) { setPlaying(false); return; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed]);

  const fcBucket = Math.floor(s.now / 5);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fc = useMemo(() => forecast(s), [fcBucket, version, s]);
  const summary = summarize(s);

  const act = (fn: () => void) => { fn(); setVersion((v) => v + 1); };
  const disrupt = {
    breakOven: (ovenId: string) => act(() => inject(s, { at: s.now, kind: "ovenBreak", ovenId, duration: 45 })),
    workerOut: (workerId: string) => act(() => inject(s, { at: s.now, kind: "workerOut", workerId, duration: 90 })),
    delay: () => act(() => delayDelivery(s, 120)),
    spill: () => act(() => spill(s, "flour", 0.4)),
    rush: () => act(() => {
      const r = RECIPES[Math.floor(Math.random() * RECIPES.length)];
      const qty = r.perTray * (1 + Math.floor(Math.random() * 3));
      inject(s, { at: s.now, kind: "order", order: {
        id: `R${s.now}`, customer: "Mayor Mallow (rush)", product: r.id as ProductId, qty, releaseAt: s.now,
        deadline: s.now + criticalPath(r) + 25, vip: true } });
    }),
  };
  // apply injected events immediately so the UI reacts while paused
  useEffect(() => {
    if (s.pending.length && s.pending[0].at <= s.now && !playing) { step(s); rerender(); }
  }, [version]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="app">
      <header className="sign">
        <Tappable className="sign-char" src={sprite("bunny")} name="Momo" lines={() => ["Welcome to Bunbun Bakery!", "Fresh bread soon!", "Hehe, that tickles!"]} />
        <div className="sign-center">
          <div className="sign-goods" aria-hidden="true">
            {["croissant", "cupcake", "melon", "cake", "donut", "baguette"].map((n) => <img key={n} src={sprite(n)} alt="" />)}
          </div>
          <h1>Bunbun Bakery</h1>
          <p>Production schedule</p>
        </div>
        <Tappable className="sign-char" imgClass="flip" src={sprite("bear")} name="Kuma" lines={() => ["The ovens are warm!", "Want a croissant?", "Kuma at your service."]} />
      </header>

      <div className="toolbar">
        <div className="clock" aria-live="polite">
          <span className="clock-time">{clock(s.now)}</span>
          <span className="clock-sub">{s.finished ? "Closed" : s.now >= s.scenario.dayLength ? "After hours" : "Open"}</span>
        </div>
        <div className="tool-group">
          <button className="btn primary" onClick={() => setPlaying((p) => !p)} disabled={s.finished}>{playing ? "Pause" : "Play"}</button>
          <button className="btn" onClick={() => { step(s); rerender(); }} disabled={s.finished || playing} title="Advance one minute">+1 min</button>
          <button className="btn" onClick={() => { for (let i = 0; i < 30 && !s.finished; i++) step(s); rerender(); }} disabled={s.finished || playing}>+30 min</button>
        </div>
        <div className="seg" role="radiogroup" aria-label="Speed">
          {SPEEDS.map((x) => (
            <button key={x} role="radio" aria-checked={speed === x} className={speed === x ? "on" : ""} onClick={() => setSpeed(x)}>{x}×</button>
          ))}
        </div>
        <label className="field">
          <span>Policy</span>
          <select value={policy} onChange={(e) => { const p = e.target.value as PolicyId; setPolicy(p); setPlaying(false); reset(p); }}>
            {POLICIES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Day</span>
          <input type="number" min={1} value={seed} onChange={(e) => {
            const v = Math.max(1, Number(e.target.value) || 1); setSeed(v); setPlaying(false);
            if (!api) { const sc = makeScenario(v); setScenario(sc); reset(policy, sc); }
          }} />
        </label>
        <button className="btn ghost" onClick={() => { setPlaying(false); reset(); }}>Reset</button>
        {api && <span className={`src ${source}`}>{source === "postgres" ? "PostgreSQL" : "Built-in data"}</span>}
      </div>

      <section className="hero">
        <div className="scene">
          <img src={sprite("scene")} alt="The bakery floor" />
        </div>
        <Kpis summary={summary} s={s} memo={POLICIES.find((p) => p.id === policy)!.blurb} unlocked={unlocked} />
      </section>

      <nav className="tabs" role="tablist">
        {([["floor", "Floor"], ["schedule", "Schedule"], ["metrics", "Metrics"]] as [Tab, string][]).map(([id, l]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>{l}</button>
        ))}
      </nav>

      <OrderToasts s={s} unlocked={unlocked} onShow={answerOrder} />

      {tab === "floor" && <Floor s={s} disrupt={disrupt} cues={cues} />}
      {tab === "schedule" && <Schedule s={s} fc={fc} />}
      {tab === "metrics" && <Metrics s={s} summary={summary} scenario={scenario} api={api} />}
    </div>
  );
}