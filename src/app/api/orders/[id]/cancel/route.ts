import { NextResponse } from "next/server";
import { bch, hasBch } from "@/lib/bch";
import { errorResponse } from "@/lib/http";
import { getOrder, releaseOrder } from "@/lib/orders";

/** The buyer changed their mind before paying: the items go back in the shop. */
export async function POST(_request: Request, ctx: RouteContext<"/api/orders/[id]/cancel">) {
  try {
    const order = await getOrder((await ctx.params).id);
    if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    if (order.status !== "pending" && order.status !== "reserved") return NextResponse.json({ ok: true, status: order.status });
    if (order.method === "bch" && hasBch()) {
      // Something already sent (even part) means it can't simply be dropped.
      const view = await bch().check(order.id).catch(() => null);
      if (view && view.state !== "waiting" && view.state !== "expired")
        return NextResponse.json({ error: "A payment has already arrived for this order, so it can't be cancelled here. Please contact me." }, { status: 409 });
      await bch().close(order.id).catch(() => {});
    }
    await releaseOrder(order.id, "cancelled");
    return NextResponse.json({ ok: true, status: "cancelled" });
  } catch (e) {
    return errorResponse(e);
  }
}
