import { NextResponse } from "next/server";
import { loadScenario } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const seed = Number(new URL(req.url).searchParams.get("seed") ?? 7);
  try {
    return NextResponse.json(await loadScenario(seed));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
