import type { SimState, Summary } from "@/lib/engine";

export function Kpis({ summary: m, s }: { summary: Summary; s: SimState }) {
  const open = Object.values(s.orders).filter((o) => o.completedAt == null && o.status !== "cancelled").length;
  const idleWork = m.ovenIdleWithWorkMin;
  const tiles = [
    { k: "On time", v: `${m.ordersOnTime}/${m.orders}`, sub: `${open} still open`, tone: "" },
    { k: "Throughput", v: m.throughputUnitsPerHr.toFixed(0), unit: "items/hr", sub: `${m.unitsDone} items · ${m.ordersPerHr.toFixed(1)} orders/hr`, tone: "" },
    { k: "Oven utilization", v: m.ovenUtilPct.toFixed(0), unit: "%", sub: `batches ${m.ovenFillPct.toFixed(0)}% full · ${m.changeovers} temp changes`, tone: "" },
    { k: "Idle time", v: `${m.workerIdleMin}`, unit: "baker-min", sub: `ovens idle ${m.ovenIdleMin} min (${idleWork} with dough waiting)`, tone: idleWork > 30 ? "warn" : "" },
    { k: "Delays", v: `${m.ordersLate}`, unit: "late", sub: `${m.ordersCancelled} cancelled · avg ${m.avgLatenessMin.toFixed(0)} min late`, tone: m.ordersLate + m.ordersCancelled > 0 ? "warn" : "" },
    { k: "Wasted", v: `$${m.wasteCost.toFixed(2)}`, sub: `${m.overproofs} over-proofed · ${m.wasteUnits} items binned`, tone: m.wasteCost > 0 ? "bad" : "" },
  ];
  return (
    <div className="kpis">
      {tiles.map((t) => (
        <div key={t.k} className={`kpi ${t.tone}`}>
          <div className="kpi-k">{t.tone === "bad" ? "⚠ " : t.tone === "warn" ? "▲ " : ""}{t.k}</div>
          <div className="kpi-v">{t.v}{t.unit && <small> {t.unit}</small>}</div>
          <div className="kpi-sub">{t.sub}</div>
        </div>
      ))}
    </div>
  );
}
