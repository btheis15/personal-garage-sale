import { NextResponse } from "next/server";
import { bch, bchStart, hasBch } from "@/lib/bch";
import { errorResponse, readJson } from "@/lib/http";
import { getOrder, setOrderFields } from "@/lib/orders";
import { hasStripe, startStripeCheckout, stripe, syncSession } from "@/lib/stripe";

/**
 * The buyer picks (or switches) how to pay an order that's waiting for payment: { method: "stripe" | "bch" }.
 * Used by in-person sales (the buyer scans the QR code in the Sell app) and when a buyer comes back
 * from Stripe to pay another way.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/orders/[id]/pay">) {
  try {
    let order = await getOrder((await ctx.params).id);
    if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    const { method } = await readJson(request);

    // Leaving a card checkout: close Stripe's page first, so it can't be paid as well.
    if (method === "bch" && order.stripeSessionId) {
      await stripe().checkout.sessions.expire(order.stripeSessionId).catch(() => {});
      // It may have been paid just before: then the order is paid, and that's that.
      const session = await stripe().checkout.sessions.retrieve(order.stripeSessionId);
      if (session.payment_status === "paid") order = (await syncSession(session)) ?? order;
    }
    if (order.status !== "pending")
      return NextResponse.json({ error: order.status === "paid" || order.status === "completed" ? "This order is already paid." : "This order has closed." }, { status: 409 });

    if (method === "stripe" && hasStripe()) {
      // Leaving Bitcoin Cash: only while nothing has been sent.
      if (hasBch() && (await bch().payment(order.id))) {
        const view = await bch().check(order.id);
        if (view.state !== "waiting" && view.state !== "expired")
          return NextResponse.json({ error: "A Bitcoin Cash payment has already arrived for this order." }, { status: 409 });
        await bch().close(order.id);
      }
      return NextResponse.json({ url: await startStripeCheckout(order) });
    }
    if (method === "bch" && hasBch()) {
      await setOrderFields(order.id, { method: "bch", stripe_session_id: null });
      return NextResponse.json({ view: await bchStart(order) });
    }
    return NextResponse.json({ error: "That way to pay isn't available." }, { status: 400 });
  } catch (e) {
    return errorResponse(e);
  }
}
