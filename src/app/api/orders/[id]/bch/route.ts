import { NextResponse } from "next/server";
import { bchCheck, hasBch } from "@/lib/bch";
import { errorResponse } from "@/lib/http";
import { isUuid } from "@/lib/orders";

/** The Bitcoin Cash payment as it stands: the payment screen asks every few seconds. */
export async function GET(_request: Request, ctx: RouteContext<"/api/orders/[id]/bch">) {
  try {
    const { id } = await ctx.params;
    if (!hasBch() || !isUuid(id)) return NextResponse.json({ error: "Payment not found." }, { status: 404 });
    return NextResponse.json(await bchCheck(id), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e, "Couldn't reach the Bitcoin Cash network. Trying again…");
  }
}
