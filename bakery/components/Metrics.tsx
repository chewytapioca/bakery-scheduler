import { useEffect, useState } from "react";
import {
  POLICIES, clock, comparePolicies, makeScenario, type PolicyId, type Scenario, type SimState, type Summary,
} from "@/lib/engine";

// Validated categorical palettes (see dataviz validator): policies and resource states.
const POLICY_COLOR: Record<PolicyId, string> = { fifo: "#3f74b8", edf: "#c98a2a", smart: "#c24f63" };
const STATE = { busy: "#3f8a5a", heat: "#c98a2a", stuck: "#c24f63", idle: "#e8dcc6" };

function Tip({ tip }: { tip: { x: number; y: number; html: React.ReactNode } | null }) {
  return tip ? <div className="tip" style={{ left: tip.x + 12, top: tip.y + 12 }}>{tip.html}</div> : null;
}

function Utilization({ s }: { s: SimState }) {
  const [tip, setTip] = useState<{ x: number; y: number; html: React.ReactNode } | null>(null);
  const c = s.c;
  const rows = [
    ...s.ovens.map((o) => ({ name: o.name, parts: [
      { k: "Baking", v: c.ovenBake[o.id], col: STATE.busy }, { k: "Heating / changeover", v: c.ovenHeat[o.id], col: STATE.heat },
      { k: "Blocked / down", v: c.ovenBlocked[o.id] + c.ovenDown[o.id], col: STATE.stuck }, { k: "Idle", v: c.ovenIdle[o.id], col: STATE.idle }] })),
    ...s.workers.map((w) => ({ name: w.name, parts: [
      { k: "Working", v: c.workerBusy[w.id], col: STATE.busy }, { k: "Idle on shift", v: c.workerIdle[w.id], col: STATE.idle }] })),
  ];
  const max = Math.max(1, ...rows.map((r) => r.parts.reduce((a, p) => a + p.v, 0)));
  return (
    <div className="util-chart" onMouseLeave={() => setTip(null)}>
      <div className="legend">
        {[["Busy / baking", STATE.busy], ["Heating", STATE.heat], ["Blocked / down", STATE.stuck], ["Idle", STATE.idle]].map(([k, col]) => (
          <span key={k}><i style={{ background: col }} />{k}</span>))}
      </div>
      {rows.map((r) => {
        const total = r.parts.reduce((a, p) => a + p.v, 0);
        const busy = r.parts[0].v;
        return (
          <div key={r.name} className="util-row">
            <span className="util-name">{r.name}</span>
            <div className="util-track">
              {r.parts.filter((p) => p.v > 0).map((p) => (
                <i key={p.k} style={{ width: `${(100 * p.v) / max}%`, background: p.col }}
                  onMouseMove={(e) => setTip({ x: (e.nativeEvent as MouseEvent).pageX - (e.currentTarget.closest(".util-chart") as HTMLElement).getBoundingClientRect().left - window.scrollX, y: e.nativeEvent.offsetY + 40, html: <><b>{r.name}</b><div>{p.k}: {p.v} min ({total ? Math.round((100 * p.v) / total) : 0}%)</div></> })} />
              ))}
            </div>
            <span className="util-val">{total ? Math.round((100 * busy) / total) : 0}%</span>
          </div>
        );
      })}
      <Tip tip={tip} />
    </div>
  );
}

function LineChart({ s }: { s: SimState }) {
  const data = s.c.series;
  const [hi, setHi] = useState<number | null>(null);
  const W = 520, H = 170, L = 34, B = 22, T = 10;
  const maxT = Math.max(s.scenario.dayLength, data.at(-1)?.t ?? 0);
  const maxY = Math.max(4, ...data.map((d) => d.wip + d.queue));
  const x = (t: number) => L + (t / maxT) * (W - L - 24);
  const y = (v: number) => T + (1 - v / maxY) * (H - T - B);
  const series = [
    { k: "In production", f: (d: (typeof data)[0]) => d.wip, col: "#3f8a5a" },
    { k: "Waiting to start", f: (d: (typeof data)[0]) => d.queue, col: "#c98a2a" },
  ];
  const d = hi != null ? data[hi] : null;
  return (
    <div className="linechart">
      <div className="legend">{series.map((sr) => <span key={sr.k}><i style={{ background: sr.col }} />{sr.k}</span>)}</div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Lots in production and waiting over the day"
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const t = ((e.clientX - r.left) / r.width * W - L) / (W - L - 24) * maxT;
          if (!data.length) return;
          let best = 0; data.forEach((p, i) => { if (Math.abs(p.t - t) < Math.abs(data[best].t - t)) best = i; });
          setHi(best);
        }} onMouseLeave={() => setHi(null)}>
        {[0, 0.5, 1].map((f) => <g key={f}><line x1={L} x2={W - 24} y1={y(maxY * f)} y2={y(maxY * f)} stroke="#efe1c9" /><text x={L - 6} y={y(maxY * f) + 4} textAnchor="end" className="tick">{Math.round(maxY * f)}</text></g>)}
        {[0, 120, 240, 360, 480, 600].filter((t) => t <= maxT).map((t) => <text key={t} x={x(t)} y={H - 6} textAnchor="middle" className="tick">{clock(t)}</text>)}
        {series.map((sr) => (
          <polyline key={sr.k} fill="none" stroke={sr.col} strokeWidth={2} strokeLinejoin="round" points={data.map((p) => `${x(p.t)},${y(sr.f(p))}`).join(" ")} />
        ))}
        {d && <>
          <line x1={x(d.t)} x2={x(d.t)} y1={T} y2={H - B} stroke="#8a5a33" strokeDasharray="3 3" />
          {series.map((sr) => <circle key={sr.k} cx={x(d.t)} cy={y(sr.f(d))} r={4} fill={sr.col} stroke="#fffaf0" strokeWidth={2} />)}
        </>}
      </svg>
      {d && <div className="tip static"><b>{clock(d.t)}</b> · {d.wip} in production · {d.queue} waiting · {d.done} orders on time · ${d.waste.toFixed(2)} wasted</div>}
    </div>
  );
}

function Waste({ s }: { s: SimState }) {
  const byReason: Record<string, { cost: number; n: number }> = {};
  for (const w of s.waste) { byReason[w.reason] ??= { cost: 0, n: 0 }; byReason[w.reason].cost += w.cost; byReason[w.reason].n++; }
  const ing = Object.entries(s.c.wasteByIngredient).filter(([, q]) => q! > 0);
  const names: Record<string, string> = { overproof: "Over-proofed dough", breakdown: "Ruined in broken oven", cancelled: "Cancelled orders", spoiled: "Spilled / spoiled stock" };
  if (!s.waste.length) return <p className="note">Nothing wasted yet.</p>;
  return (
    <div className="waste">
      <table className="mini">
        <thead><tr><th>Cause</th><th>Events</th><th>Cost</th></tr></thead>
        <tbody>{Object.entries(byReason).map(([k, v]) => <tr key={k}><td>{names[k] ?? k}</td><td>{v.n}</td><td>${v.cost.toFixed(2)}</td></tr>)}</tbody>
      </table>
      <table className="mini">
        <thead><tr><th>Ingredient</th><th>Wasted</th></tr></thead>
        <tbody>{ing.map(([k, q]) => {
          const i = s.scenario.ingredients.find((x) => x.id === k)!;
          return <tr key={k}><td>{i.name}</td><td>{i.unit === "pc" ? Math.round(q!) : `${(q! / 1000).toFixed(2)} ${i.unit === "g" ? "kg" : "L"}`}</td></tr>;
        })}</tbody>
      </table>
    </div>
  );
}

const CMP: { k: keyof Summary; label: string; fmt: (v: number) => string; better: "hi" | "lo" }[] = [
  { k: "onTimePct", label: "On-time orders", fmt: (v) => `${v.toFixed(0)}%`, better: "hi" },
  { k: "avgLatenessMin", label: "Avg lateness (late orders)", fmt: (v) => `${v.toFixed(0)}m`, better: "lo" },
  { k: "ordersCancelled", label: "Cancelled orders", fmt: (v) => v.toFixed(1), better: "lo" },
  { k: "throughputUnitsPerHr", label: "Throughput (items/hr)", fmt: (v) => v.toFixed(0), better: "hi" },
  { k: "ovenFillPct", label: "Oven batch fill", fmt: (v) => `${v.toFixed(0)}%`, better: "hi" },
  { k: "wasteCost", label: "Ingredient waste", fmt: (v) => `$${v.toFixed(0)}`, better: "lo" },
];

function Compare({ results, title }: { results: Summary[]; title: string }) {
  return (
    <div>
      <div className="card-sub">{title}</div>
      <div className="legend">{POLICIES.map((p) => <span key={p.id}><i style={{ background: POLICY_COLOR[p.id] }} />{p.name}</span>)}</div>
      <div className="multiples">
        {CMP.map((m) => {
          const vals = results.map((r) => r[m.k] as number);
          const max = Math.max(...vals, 1e-9);
          const best = m.better === "hi" ? Math.max(...vals) : Math.min(...vals);
          return (
            <div key={m.k} className="multiple">
              <div className="multiple-h">{m.label} <small>{m.better === "hi" ? "↑ better" : "↓ better"}</small></div>
              {results.map((r) => {
                const v = r[m.k] as number;
                return (
                  <div key={r.policy} className="hbar" title={`${POLICIES.find((p) => p.id === r.policy)!.name}: ${m.fmt(v)}`}>
                    <span className="hbar-l">{POLICIES.find((p) => p.id === r.policy)!.name}</span>
                    <span className="hbar-t"><i style={{ width: `${Math.max(1.5, (100 * v) / max)}%`, background: POLICY_COLOR[r.policy] }} /></span>
                    <span className={`hbar-v ${v === best ? "best" : ""}`}>{m.fmt(v)}</span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function average(list: Summary[][]): Summary[] {
  return POLICIES.map((p, pi) => {
    const rs = list.map((day) => day[pi]);
    const avg = { ...rs[0] };
    for (const k of Object.keys(avg) as (keyof Summary)[])
      if (typeof avg[k] === "number") (avg as Record<string, unknown>)[k] = rs.reduce((a, r) => a + (r[k] as number), 0) / rs.length;
    return { ...avg, policy: p.id };
  });
}

export function Metrics({ s, scenario, api }: { s: SimState; summary: Summary; scenario: Scenario; api: boolean }) {
  const [today, setToday] = useState<Summary[] | null>(null);
  const [bench, setBench] = useState<Summary[] | null>(null);
  const [runs, setRuns] = useState<Record<string, unknown>[]>([]);
  const [msg, setMsg] = useState("");
  useEffect(() => { setToday(comparePolicies(scenario)); }, [scenario]);
  const loadRuns = () => api && fetch("/api/runs").then((r) => r.json()).then((d) => setRuns(d.runs ?? [])).catch(() => {});
  useEffect(() => { loadRuns(); }, [api]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="metrics">
      <div className="grid2">
        <div className="panel">
          <div className="h-row"><h2 className="h">Time by resource</h2><span className="note">minutes so far, during opening hours</span></div>
          <Utilization s={s} />
        </div>
        <div className="panel">
          <div className="h-row"><h2 className="h">Work in progress</h2><span className="note">lots, sampled every 10 min</span></div>
          <LineChart s={s} />
          <h2 className="h" style={{ marginTop: 18 }}>Waste</h2>
          <Waste s={s} />
        </div>
      </div>

      <div className="panel">
        <div className="h-row">
          <h2 className="h">Policy comparison</h2>
          <div className="row">
            <button className="btn" onClick={() => {
              setMsg("Simulating 30 days…");
              setTimeout(() => { const days = Array.from({ length: 30 }, (_, i) => comparePolicies(makeScenario(i + 1))); setBench(average(days)); setMsg(""); }, 30);
            }}>Benchmark 30 days</button>
            {api && <button className="btn primary" onClick={async () => {
              setMsg("Saving…");
              const r = await fetch("/api/compare", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ seed: scenario.seed, save: true }) }).then((r) => r.json());
              setMsg(r.results?.[0]?.id ? "Saved 3 runs to PostgreSQL." : "No DATABASE_URL set, so nothing was saved."); loadRuns();
            }}>Run on server &amp; save</button>}
            <span className="note">{msg}</span>
          </div>
        </div>
        <p className="note">The same day of orders, with no disruptions, run under each policy. Ovens, bakers and constraints are identical; only the decisions differ.</p>
        <div className="grid2">
          {today && <Compare results={today} title={`Today (day #${scenario.seed}), full day`} />}
          {bench ? <Compare results={bench} title="Average over 30 random days" /> : <div className="placeholder note">Run the 30-day benchmark to see if the result holds beyond one day.</div>}
        </div>
        <details className="algo">
          <summary>How the policies decide</summary>
          <ul>
            <li><b>FIFO</b> – every queue served in arrival order; each oven batch is filled with whatever is first in line at that temperature; first free baker takes the task.</li>
            <li><b>Earliest deadline</b> – queues sorted by order due time; batches seeded by the most urgent tray.</li>
            <li><b>Slack + batching</b> – tasks ranked by the <i>Apparent Tardiness Cost</i> index (w/p)·e<sup>−slack/(K·p̄)</sup>, so short urgent jobs go first on the mixers (the bottleneck); dough within 15 min of over-proofing jumps the queue; orders that will blow past the customer&apos;s patience are triaged to the back instead of dragging others down (the EDF “domino effect”); ingredients are reserved in priority order so a low-priority lot can&apos;t eat the butter an urgent one needs; oven batches are chosen by scoring every (oven, temperature) pair on fill, changeover time, bake-time spread and urgency, and an oven may <i>hold</i> briefly for a fuller batch when nothing urgent is waiting and same-temperature dough is minutes away.</li>
          </ul>
        </details>
      </div>

      {api && runs.length > 0 && (
        <div className="panel">
          <div className="h-row"><h2 className="h">Saved runs</h2><span className="note">from PostgreSQL · sim_runs</span></div>
          <div className="table-wrap">
            <table className="orders">
              <thead><tr><th>ID</th><th>When</th><th>Policy</th><th>Day #</th><th>On time</th><th>Avg late</th><th>Items/hr</th><th>Oven util</th><th>Waste</th></tr></thead>
              <tbody>{runs.map((r) => (
                <tr key={String(r.id)}><td>{String(r.id)}</td><td>{new Date(String(r.created_at)).toLocaleString()}</td><td>{String(r.policy)}</td><td>{String(r.seed)}</td>
                  <td>{Number(r.on_time_pct).toFixed(0)}%</td><td>{Number(r.avg_lateness).toFixed(0)}m</td><td>{Number(r.throughput).toFixed(0)}</td>
                  <td>{Number(r.oven_util).toFixed(0)}%</td><td>${Number(r.waste_cost).toFixed(2)}</td></tr>))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}