import { NextResponse } from "next/server";
import { hasBch } from "@/lib/bch";
import { hasDatabase } from "@/lib/db";
import { errorResponse, readCustomer, readJson, readLines } from "@/lib/http";
import { placeOrder, releaseOrder } from "@/lib/orders";
import { readSettings } from "@/lib/settings";
import { CHECKOUT_HOLD_MINUTES } from "@/lib/site";
import { hasStripe, startStripeCheckout } from "@/lib/stripe";

/**
 * The shop's checkout: { lines: [{ id, qty }], customer, fulfillment: "pickup" | "ship", method: "stripe" | "bch" | "pickup" }.
 * Holds the items, then sends the buyer to Stripe, to the Bitcoin Cash payment screen, or (pay at
 * pickup) to their order page.
 */
export async function POST(request: Request) {
  try {
    if (!hasDatabase) return NextResponse.json({ error: "This is a preview: checkout opens once the shop is set up." }, { status: 503 });
    const body = await readJson(request);
    const settings = await readSettings();
    const method = body.method;
    const fulfillment = body.fulfillment === "ship" && settings.shipping ? "ship" : "pickup";
    const customer = readCustomer(body.customer);
    if (!customer.name) return NextResponse.json({ error: "Please add your name." }, { status: 400 });
    if (!customer.email) return NextResponse.json({ error: "Please add your email, so I can send your receipt and pickup details." }, { status: 400 });
    const lines = readLines(body.lines);

    if (method === "pickup") {
      if (!settings.payAtPickup || fulfillment !== "pickup") return NextResponse.json({ error: "Pay at pickup isn't available." }, { status: 400 });
      const order = await placeOrder({ lines, status: "reserved", method: null, customer, fulfillment, holdMinutes: settings.payAtPickupHours * 60 });
      return NextResponse.json({ url: `/order/${order.id}` });
    }
    if (method === "stripe") {
      if (!hasStripe()) return NextResponse.json({ error: "Card payments aren't available right now." }, { status: 400 });
      const order = await placeOrder({ lines, method: "stripe", customer, fulfillment, holdMinutes: CHECKOUT_HOLD_MINUTES, defaultShippingCents: settings.defaultShippingCents });
      try {
        return NextResponse.json({ url: await startStripeCheckout(order) });
      } catch (e) {
        await releaseOrder(order.id);
        throw e;
      }
    }
    if (method === "bch") {
      if (!hasBch()) return NextResponse.json({ error: "Bitcoin Cash isn't available right now." }, { status: 400 });
      const order = await placeOrder({ lines, method: "bch", customer, fulfillment, holdMinutes: CHECKOUT_HOLD_MINUTES, defaultShippingCents: settings.defaultShippingCents });
      return NextResponse.json({ url: `/order/${order.id}` });
    }
    return NextResponse.json({ error: "Pick how you'd like to pay." }, { status: 400 });
  } catch (e) {
    return errorResponse(e);
  }
}
