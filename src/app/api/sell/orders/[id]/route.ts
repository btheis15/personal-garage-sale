import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { bch, hasBch } from "@/lib/bch";
import { errorResponse, readJson } from "@/lib/http";
import { completeOrder, getOrder, markPaid, releaseOrder, setOrderFields } from "@/lib/orders";
import type { PayMethod } from "@/lib/types";

const HAND_METHODS: PayMethod[] = ["cash", "venmo", "other"];

export async function GET(request: Request, ctx: RouteContext<"/api/sell/orders/[id]">) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const order = await getOrder((await ctx.params).id);
  if (!order) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const payment = order.method === "bch" && hasBch() ? await bch().payment(order.id).catch(() => null) : null;
  return NextResponse.json({ order, bch: payment ? { events: payment.events ?? [], problems: payment.problems ?? [], address: payment.address } : null });
}

/** { action: "paid", method } · { action: "complete" } · { action: "cancel" } · { action: "note", notes } */
export async function PATCH(request: Request, ctx: RouteContext<"/api/sell/orders/[id]">) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    const order = await getOrder(id);
    if (!order) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const body = await readJson(request);
    switch (body.action) {
      case "paid": {
        const method = body.method as PayMethod;
        if (!HAND_METHODS.includes(method)) return NextResponse.json({ error: "Pick how they paid." }, { status: 400 });
        await markPaid(id, method);
        break;
      }
      case "complete":
        await completeOrder(id);
        break;
      case "cancel":
        if (order.status === "paid" || order.status === "completed")
          return NextResponse.json({ error: "It's paid: refund it first (Stripe dashboard, or send the BCH back), then mark the items back for sale." }, { status: 409 });
        if (order.method === "bch" && hasBch()) await bch().close(id).catch(() => {});
        await releaseOrder(id, "cancelled");
        break;
      case "note":
        await setOrderFields(id, { notes: typeof body.notes === "string" ? body.notes.slice(0, 2000) : "" });
        break;
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
    return NextResponse.json({ order: await getOrder(id) });
  } catch (e) {
    return errorResponse(e);
  }
}
