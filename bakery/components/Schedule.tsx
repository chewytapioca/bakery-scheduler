import { useState } from "react";
import { clock, recipeOf, type Interval, type SimState } from "@/lib/engine";
import { sprite } from "@/lib/sprites";

type FC = { eta: Record<string, { at: number | null; status: string }>; intervals: Interval[] };

export function Schedule({ s, fc }: { s: SimState; fc: FC }) {
  const rows = [
    ...s.ovens.map((o) => ({ id: o.id, name: o.name, img: null as string | null })),
    ...s.stations.filter((x) => x.kind === "mixer").map((x) => ({ id: x.id, name: x.name, img: null })),
    ...s.workers.map((w) => ({ id: w.id, name: w.name, img: sprite(w.sprite) })),
  ];
  const end = Math.max(s.scenario.dayLength, s.now, ...fc.intervals.map((i) => i.end)) + 10;
  const PX = 2.1, LEFT = 130, ROW = 30, TOP = 24;
  const W = LEFT + end * PX + 10, H = TOP + rows.length * ROW + 6;
  const x = (t: number) => LEFT + t * PX;
  const [hover, setHover] = useState<{ iv: Interval; future: boolean; x: number; y: number } | null>(null);
  // forecast only adds what isn't already committed in the real schedule
  const future = fc.intervals.filter((iv) => iv.start >= s.now);

  const bar = (iv: Interval, i: number, isFuture: boolean) => {
    const r = rows.findIndex((r) => r.id === iv.resource);
    if (r < 0 || iv.end <= iv.start) return null;
    const y = TOP + r * ROW + 5;
    const fill = iv.kind === "down" ? "url(#hatch)" : iv.kind === "heat" ? "#f2d3a0" : iv.color;
    return (
      <rect key={`${isFuture ? "f" : "p"}${i}`} x={x(iv.start) + 1} y={y} width={Math.max(1.5, (iv.end - iv.start) * PX - 2)} height={ROW - 10} rx={4}
        fill={fill} opacity={isFuture ? 0.45 : iv.kind === "ruined" ? 0.35 : 1}
        stroke={iv.kind === "ruined" ? "#c2456a" : isFuture ? "#8c6b5d" : "none"} strokeDasharray={isFuture ? "3 2" : undefined} strokeWidth={1}
        onMouseMove={(e) => setHover({ iv, future: isFuture, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY })} onMouseLeave={() => setHover(null)} />
    );
  };

  const orders = s.orderOrder.map((id) => s.orders[id]);
  const unreleased = s.pending.filter((e) => e.kind === "order").length;
  return (
    <div className="schedule">
      <div className="card">
        <div className="card-h">
          <h2>Schedule</h2>
          <span className="muted small">Solid = done/committed · faded dashed = forecast if no new orders arrive (re-planned every 5 min) · hatched = down</span>
        </div>
        <div className="gantt-wrap">
          <svg width={W} height={H} className="gantt" role="img" aria-label="Gantt chart of ovens, mixers and bakers">
            <defs>
              <pattern id="hatch" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
                <rect width="6" height="6" fill="#efe7e4" /><line x1="0" y1="0" x2="0" y2="6" stroke="#c9b8b2" strokeWidth="2" />
              </pattern>
            </defs>
            {Array.from({ length: Math.ceil(end / 60) + 1 }).map((_, h) => (
              <g key={h}>
                <line x1={x(h * 60)} x2={x(h * 60)} y1={TOP - 4} y2={H} stroke="#f0e2dc" />
                <text x={x(h * 60) + 3} y={14} className="tick">{clock(h * 60)}</text>
              </g>
            ))}
            {rows.map((r, i) => (
              <g key={r.id}>
                {i % 2 === 0 && <rect x={0} y={TOP + i * ROW} width={W} height={ROW} fill="#fdf5f0" />}
                {r.img && <image href={r.img} x={6} y={TOP + i * ROW + 3} width={22} height={24} />}
                <text x={r.img ? 32 : 8} y={TOP + i * ROW + 19} className="rowlabel">{r.name}</text>
              </g>
            ))}
            {s.intervals.map((iv, i) => bar(iv, i, false))}
            {future.map((iv, i) => bar(iv, i, true))}
            <line x1={x(s.now)} x2={x(s.now)} y1={TOP - 6} y2={H} stroke="#c2456a" strokeWidth={2} />
            <line x1={x(s.scenario.dayLength)} x2={x(s.scenario.dayLength)} y1={TOP - 6} y2={H} stroke="#8c6b5d" strokeDasharray="4 3" />
          </svg>
          {hover && (
            <div className="tip" style={{ left: hover.x + 12, top: hover.y + 10 }}>
              <b>{hover.iv.label}</b>
              <div>{clock(hover.iv.start)}–{clock(hover.iv.end)} · {hover.iv.end - hover.iv.start} min</div>
              <div className="muted">{hover.future ? "forecast" : hover.iv.kind === "ruined" ? "ruined / interrupted" : hover.iv.kind}</div>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <h2>Orders</h2>
          <span className="muted small">{orders.length} received · {unreleased} more expected today</span>
        </div>
        <div className="table-wrap">
          <table className="orders">
            <thead><tr><th>#</th><th>Customer</th><th>Item</th><th>Qty</th><th>In</th><th>Due</th><th>ETA</th><th>Progress</th><th>Status</th></tr></thead>
            <tbody>
              {[...orders].sort((a, b) => Number(a.completedAt != null || a.status === "cancelled") - Number(b.completedAt != null || b.status === "cancelled") || a.deadline - b.deadline).map((o) => {
                const rec = recipeOf(s, o.product);
                const eta = o.completedAt ?? fc.eta[o.id]?.at ?? null;
                const etaLate = eta != null && eta > o.deadline;
                const lots = o.lotIds.map((id) => s.lots[id]);
                const status = o.status === "cancelled" ? "cancelled" : o.completedAt != null ? (o.status === "late" ? "late" : "done")
                  : fc.eta[o.id]?.status === "cancelled" ? "at risk" : etaLate ? "will be late" : lots.some((l) => l.consumed) ? "in production" : "queued";
                return (
                  <tr key={o.id} className={status.replace(/ /g, "-")}>
                    <td>{o.id}</td>
                    <td>{o.customer}{o.vip && " ⭐"}</td>
                    <td className="item"><img src={sprite(rec.sprite)} alt="" />{rec.name}</td>
                    <td>{o.qty}</td>
                    <td>{clock(o.releaseAt)}</td>
                    <td>{clock(o.deadline)}</td>
                    <td className={etaLate ? "neg" : ""}>{eta != null ? `${o.completedAt == null ? "~" : ""}${clock(eta)}` : "—"}</td>
                    <td>
                      <div className="dots">
                        {lots.map((l) => <i key={l.id} className={`dot d-${l.stage}`} title={`${l.id}: ${l.stage}`} />)}
                      </div>
                    </td>
                    <td><span className={`pill ${status.replace(/ /g, "-")}`}>{status}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="dot-legend muted small">
          {["mix", "rest", "shape", "bake", "cool", "finish", "done"].map((k) => <span key={k}><i className={`dot d-${k}`} />{k}</span>)}
        </div>
      </div>
    </div>
  );
}
