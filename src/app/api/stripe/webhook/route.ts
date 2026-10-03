import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe, syncSession } from "@/lib/stripe";

/**
 * Stripe's notices (Stripe → Developers → Webhooks → Add destination: <your site>/api/stripe/webhook,
 * events checkout.session.completed, checkout.session.async_payment_succeeded,
 * checkout.session.async_payment_failed, checkout.session.expired). The signing secret goes in
 * STRIPE_WEBHOOK_SECRET.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET isn't set." }, { status: 500 });
  const payload = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(payload, request.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }
  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
      case "checkout.session.async_payment_failed":
      case "checkout.session.expired":
        await syncSession(event.data.object);
        break;
    }
    return NextResponse.json({ received: true });
  } catch (e) {
    console.error("[stripe webhook]", e);
    // Stripe tries again later.
    return NextResponse.json({ error: "Couldn't process it yet." }, { status: 500 });
  }
}
