import { NextResponse } from "next/server";
import { errorResponse, isId } from "@/lib/http";
import { shopApi, shopperIp } from "@/lib/shop";

/** The buyer picks (or switches) how to pay: { method: "stripe" | "bch" } → { url } or { view }. */
export async function POST(request: Request, ctx: RouteContext<"/api/orders/[id]/pay">) {
  const { id } = await ctx.params;
  if (!isId(id)) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  try {
    const { method } = await request.json().catch(() => ({}));
    return NextResponse.json(await shopApi(`/api/orders/${id}/pay`, { method: "POST", body: { method }, shopperIp: shopperIp(request.headers) }));
  } catch (e) {
    return errorResponse(e);
  }
}
