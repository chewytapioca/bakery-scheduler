import { clock, type SimState, type Summary } from "@/lib/engine";
import { ACHIEVEMENTS } from "@/lib/achievements";
import { sprite } from "@/lib/sprites";

/** Today's numbers, laid out like a bakery notebook card: ruled rows, a memo line at the bottom. */
export function Kpis({ summary: m, s, memo, unlocked = [] }: { summary: Summary; s: SimState; memo: string; unlocked?: string[] }) {
  const open = Object.values(s.orders).filter((o) => o.completedAt == null && o.status !== "cancelled").length;
  const rows: { k: string; v: string; sub: string; tone?: "warn" | "bad" }[] = [
    { k: "On time", v: `${m.ordersOnTime} of ${m.orders}`, sub: `${open} still open` },
    { k: "Throughput", v: `${m.throughputUnitsPerHr.toFixed(0)} items/hr`, sub: `${m.unitsDone} items, ${m.ordersPerHr.toFixed(1)} orders/hr` },
    { k: "Ovens", v: `${m.ovenUtilPct.toFixed(0)}% busy`, sub: `batches ${m.ovenFillPct.toFixed(0)}% full, ${m.changeovers} temperature changes` },
    { k: "Idle time", v: `${m.workerIdleMin} baker-min`, sub: `ovens idle ${m.ovenIdleMin} min, ${m.ovenIdleWithWorkMin} with dough waiting`, tone: m.ovenIdleWithWorkMin > 30 ? "warn" : undefined },
    { k: "Delays", v: `${m.ordersLate} late, ${m.ordersCancelled} cancelled`, sub: `late orders average ${m.avgLatenessMin.toFixed(0)} min`, tone: m.ordersCancelled ? "bad" : m.ordersLate ? "warn" : undefined },
    { k: "Waste", v: `$${m.wasteCost.toFixed(2)}`, sub: `${m.overproofs} over-proofed, ${m.wasteUnits} items binned`, tone: m.wasteCost > 0 ? "bad" : undefined },
  ];
  return (
    <section className="loaf" aria-label="Today's numbers">
      <div className="loaf-head">
        <h2>Today so far</h2>
        <span className="loaf-date">{clock(s.now)}</span>
      </div>
      <dl className="ledger">
        {rows.map((r) => (
          <div key={r.k} className="ledger-row">
            <dt>{r.k}</dt>
            <dd>
              <b className={r.tone}>{r.v}</b>
              <small>{r.sub}</small>
            </dd>
          </div>
        ))}
      </dl>
      <div className="badges">
        <span>Badges {unlocked.length}/{ACHIEVEMENTS.length}</span>
        <div className="badge-row">
          {ACHIEVEMENTS.map((a) => {
            const got = unlocked.includes(a.id);
            return (
              <img key={a.id} src={sprite(a.badge)} className={got ? "got" : "locked"}
                alt={`${a.name}${got ? "" : " (locked)"}`} title={`${a.name}: ${a.desc}${got ? "" : " (locked)"}`} />
            );
          })}
        </div>
      </div>
      <div className="memo">
        <span>Memo</span>
        <p>{memo}</p>
      </div>
    </section>
  );
}