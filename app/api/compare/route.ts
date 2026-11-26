import { NextResponse } from "next/server";
import { POLICIES, createSim, runToEnd, summarize } from "@/lib/engine";
import { loadScenario, saveRun } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Run the same day under every policy. Body: { seed?, save? } */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const seed = Number.isFinite(body.seed) ? Number(body.seed) : 7;
  const { scenario, source } = await loadScenario(seed);
  const results = [];
  for (const p of POLICIES) {
    const st = runToEnd(createSim(structuredClone(scenario), p.id));
    const summary = summarize(st);
    const id = body.save ? await saveRun(summary, st, "compare") : null;
    results.push({ id, summary });
  }
  return NextResponse.json({ source, results });
}
