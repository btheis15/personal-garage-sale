import { NextResponse } from "next/server";
import { errorResponse, isId } from "@/lib/http";
import { shopApi, shopperIp } from "@/lib/shop";

/** The Bitcoin Cash payment as it stands: the payment screen asks every few seconds. */
export async function GET(request: Request, ctx: RouteContext<"/api/orders/[id]/bch">) {
  const { id } = await ctx.params;
  if (!isId(id)) return NextResponse.json({ error: "Payment not found." }, { status: 404 });
  try {
    return NextResponse.json(await shopApi(`/api/orders/${id}/bch`, { shopperIp: shopperIp(request.headers) }), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
