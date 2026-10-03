import { NextResponse } from "next/server";
import { errorResponse, isId } from "@/lib/http";
import { shopApi, shopperIp } from "@/lib/shop";
import type { BuyerOrder } from "@/lib/types";

/** The buyer's order, for the order page to follow along (the id is the order's own unguessable id). */
export async function GET(request: Request, ctx: RouteContext<"/api/orders/[id]">) {
  const { id } = await ctx.params;
  if (!isId(id)) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  try {
    const { order } = await shopApi<{ order: BuyerOrder }>(`/api/orders/${id}`, { shopperIp: shopperIp(request.headers) });
    return NextResponse.json(order, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
