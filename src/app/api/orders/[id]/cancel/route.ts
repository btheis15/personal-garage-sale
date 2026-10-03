import { NextResponse } from "next/server";
import { errorResponse, isId } from "@/lib/http";
import { shopApi, shopperIp } from "@/lib/shop";

/** The buyer changed their mind before paying: the items go back in the shop. */
export async function POST(request: Request, ctx: RouteContext<"/api/orders/[id]/cancel">) {
  const { id } = await ctx.params;
  if (!isId(id)) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  try {
    return NextResponse.json(await shopApi(`/api/orders/${id}/cancel`, { method: "POST", body: {}, shopperIp: shopperIp(request.headers) }));
  } catch (e) {
    return errorResponse(e);
  }
}
