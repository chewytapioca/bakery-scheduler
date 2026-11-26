import { NextResponse } from "next/server";
import { createSim, runToEnd, summarize, type PolicyId } from "@/lib/engine";
import { loadScenario, recentRuns, saveRun } from "@/lib/db";

export const dynamic = "force-dynamic";
const POLICY = new Set<PolicyId>(["fifo", "edf", "smart"]);

/** History of saved runs. */
export async function GET() {
  return NextResponse.json({ runs: await recentRuns() });
}

/** Run a full day server-side with a policy and persist the metrics. Body: { policy, seed } */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const policy = (body.policy ?? "smart") as PolicyId;
  if (!POLICY.has(policy)) return NextResponse.json({ error: "policy must be fifo | edf | smart" }, { status: 400 });
  const seed = Number.isFinite(body.seed) ? Number(body.seed) : 7;
  const { scenario, source } = await loadScenario(seed);
  const state = runToEnd(createSim(scenario, policy));
  const summary = summarize(state);
  const id = await saveRun(summary, state, body.source ?? "api");
  return NextResponse.json({ id, source, summary });
}
