import "server-only";
import Stripe from "stripe";
import { photoUrl } from "./db";
import { getOrder, markPaid, releaseOrder, setOrderFields } from "./orders";
import { readSettings } from "./settings";
import { siteUrl } from "./site";
import type { Order } from "./types";

/**
 * Card payments through Stripe Checkout (your own Stripe account: STRIPE_SECRET_KEY). Stripe hosts
 * the card form, so card numbers never touch this site; Apple Pay, Google Pay and Link come with it.
 * A webhook (/api/stripe/webhook) tells the site when a payment goes through; the success page also
 * checks, so the order turns Paid even if the webhook is slow.
 */
const secret = () => process.env.STRIPE_SECRET_KEY ?? "";
export const hasStripe = () => /^(sk|rk)_(test|live)_/.test(secret());
export const stripeTestMode = () => secret().startsWith("sk_test_") || secret().startsWith("rk_test_");

let client: Stripe | null = null;
export function stripe() {
  if (!hasStripe()) throw new Error("Card payments aren't set up yet (STRIPE_SECRET_KEY).");
  client ??= new Stripe(secret());
  return client;
}

/** A Stripe Checkout page for the order. Returns its address. */
export async function startStripeCheckout(order: Order): Promise<string> {
  const s = await readSettings();
  const base = siteUrl();
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    client_reference_id: order.id,
    metadata: { order_id: order.id, order_number: String(order.number) },
    payment_intent_data: { metadata: { order_id: order.id, order_number: String(order.number) }, description: `${s.name} order #${order.number}` },
    line_items: [
      ...order.items.map((i) => ({
        quantity: i.qty,
        price_data: {
          currency: "usd",
          unit_amount: i.priceCents,
          product_data: { name: i.title.slice(0, 250), ...(i.photo && /^https:/.test(photoUrl(i.photo)) ? { images: [photoUrl(i.photo)] } : {}) },
        },
      })),
      ...(order.shippingCents
        ? [{ quantity: 1, price_data: { currency: "usd", unit_amount: order.shippingCents, product_data: { name: "Shipping" } } }]
        : []),
    ],
    ...(order.customer.email ? { customer_email: order.customer.email } : {}),
    ...(order.fulfillment === "ship" ? { shipping_address_collection: { allowed_countries: ["US" as const] } } : {}),
    phone_number_collection: { enabled: order.channel === "web" && !order.customer.phone },
    // Stripe's shortest: 30 minutes. The items are held a little longer (CHECKOUT_HOLD_MINUTES).
    expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
    success_url: `${base}/order/${order.id}?paid=card&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: order.channel === "in_person" ? `${base}/order/${order.id}` : `${base}/checkout?cancelled=${order.id}`,
  });
  await setOrderFields(order.id, { stripe_session_id: session.id, method: "stripe" });
  if (!session.url) throw new Error("Stripe didn't return a checkout page.");
  return session.url;
}

/** Brings the order up to date from its Checkout Session (webhook, or the success page). */
export async function syncSession(session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.order_id ?? session.client_reference_id;
  if (!orderId) return null;
  const order = await getOrder(orderId);
  if (!order) return null;
  if (session.payment_status === "paid" || session.payment_status === "no_payment_required") {
    const details = session.customer_details;
    const shipping = session.collected_information?.shipping_details;
    const customer = {
      ...order.customer,
      name: order.customer.name || details?.name || undefined,
      email: order.customer.email || details?.email || undefined,
      phone: order.customer.phone || details?.phone || undefined,
      ...(shipping?.address ? { address: { ...shipping.address, line2: shipping.address.line2 ?? undefined } } : {}),
    };
    await setOrderFields(order.id, { customer, stripe_session_id: session.id });
    const pi = typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null);
    return (await markPaid(order.id, "stripe", pi)) ?? (await getOrder(order.id));
  }
  if (session.status === "expired" && order.stripeSessionId === session.id) await releaseOrder(order.id, "expired");
  return getOrder(order.id);
}

export async function syncSessionById(id: string) {
  if (!/^cs_(test|live)_\w+$/.test(id)) return null;
  return syncSession(await stripe().checkout.sessions.retrieve(id));
}
