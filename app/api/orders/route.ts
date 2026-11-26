import { NextResponse } from "next/server";
import { RECIPES, type OrderDef, type ProductId } from "@/lib/engine";
import { insertOrder, loadScenario } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const { scenario, source } = await loadScenario();
  return NextResponse.json({ source, orders: scenario.orders });
}

/** Add an order for today. Body: { customer, product, qty, releaseAt, deadline, vip? } */
export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  const ok = b && typeof b.customer === "string" && RECIPES.some((r) => r.id === b.product)
    && Number.isInteger(b.qty) && b.qty > 0 && Number.isInteger(b.releaseAt) && Number.isInteger(b.deadline) && b.deadline > b.releaseAt;
  if (!ok) return NextResponse.json({ error: "invalid order" }, { status: 400 });
  const order: OrderDef = {
    id: b.id ?? `W${Date.now().toString(36)}`, customer: b.customer.slice(0, 60), product: b.product as ProductId,
    qty: b.qty, releaseAt: b.releaseAt, deadline: b.deadline, vip: !!b.vip,
  };
  const persisted = await insertOrder(order);
  return NextResponse.json({ order, persisted }, { status: 201 });
}
