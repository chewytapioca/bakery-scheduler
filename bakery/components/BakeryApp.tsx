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
        id: `R${s.now}`, customer: "⭐ Rush: Mayor Mallow", product: r.id as ProductId, qty, releaseAt: s.now,
        deadline: s.now + criticalPath(r) + 25, vip: true } });
    }),
  };
  // apply injected events immediately so the UI reacts while paused
  useEffect(() => {
    if (s.pending.length && s.pending[0].at <= s.now && !playing) { step(s); rerender(); }
  }, [version]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src={sprite("bunny")} alt="" className="brand-bun" />
          <div>
            <h1>Bunbun Bakery</h1>
            <p>Production scheduler &amp; simulator</p>
          </div>
        </div>
        <div className="clock" aria-live="polite">
          <span className="clock-time">{clock(s.now)}</span>
          <span className="clock-sub">{s.finished ? "closed" : s.now >= s.scenario.dayLength ? "after hours" : "open"}</span>
        </div>
        <div className="controls">
          <button className="btn primary" onClick={() => setPlaying((p) => !p)} disabled={s.finished}>
            {playing ? "❚❚ Pause" : "▶ Play"}
          </button>
          <button className="btn" onClick={() => { step(s); rerender(); }} disabled={s.finished || playing} title="Advance one minute">+1 min</button>
          <button className="btn" onClick={() => { for (let i = 0; i < 30 && !s.finished; i++) step(s); rerender(); }} disabled={s.finished || playing}>+30</button>
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
            <span>Day #</span>
            <input type="number" min={1} value={seed} onChange={(e) => {
              const v = Math.max(1, Number(e.target.value) || 1); setSeed(v); setPlaying(false);
              if (!api) { const sc = makeScenario(v); setScenario(sc); reset(policy, sc); }
            }} />
          </label>
          <button className="btn" onClick={() => { setPlaying(false); reset(); }}>↺ Reset</button>
        </div>
      </header>

      <section className="hero">
        <div className="scene">
          <img src={sprite("scene")} alt="Bakery floor" />
          <div className="scene-tag">{POLICIES.find((p) => p.id === policy)!.blurb}</div>
          {api && <div className={`src-badge ${source}`}>{source === "postgres" ? "● PostgreSQL" : "○ built-in data"}</div>}
        </div>
        <Kpis summary={summary} s={s} />
      </section>

      <nav className="tabs" role="tablist">
        {([["floor", "Production floor"], ["schedule", "Schedule & orders"], ["metrics", "Metrics & compare"]] as [Tab, string][]).map(([id, l]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>{l}</button>
        ))}
      </nav>

      {tab === "floor" && <Floor s={s} disrupt={disrupt} />}
      {tab === "schedule" && <Schedule s={s} fc={fc} />}
      {tab === "metrics" && <Metrics s={s} summary={summary} scenario={scenario} api={api} />}
    </div>
  );
}
