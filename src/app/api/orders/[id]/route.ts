import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { buyerView, getOrder } from "@/lib/orders";

/** The buyer's order, for the order page to follow along (the id is the order's own unguessable id). */
export async function GET(_request: Request, ctx: RouteContext<"/api/orders/[id]">) {
  try {
    const order = await getOrder((await ctx.params).id);
    if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    return NextResponse.json(buyerView(order), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
