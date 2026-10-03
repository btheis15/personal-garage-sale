/**
 * Card payments through Stripe Checkout, with your own Stripe account (STRIPE_SECRET_KEY in .env).
 * Stripe hosts the card form, so card numbers never touch the website or this Mac; Apple Pay,
 * Google Pay and Link come with it. Stripe tells this server when a payment goes through
 * (<PUBLIC_URL>/stripe/webhook); the website's order page also asks, in case that's slow.
 */
import Stripe from "stripe";

export function createStripe({ config, store, notifier, makeClient = (key) => new Stripe(key) }) {
  const key = config.stripeSecretKey;
  const enabled = /^(sk|rk)_(test|live)_/.test(key);
  const testMode = /^(sk|rk)_test_/.test(key);
  const client = enabled ? makeClient(key) : null;

  /** A Stripe Checkout page for the order. Returns its address. */
  async function start(order, { cancelUrl } = {}) {
    if (!client) throw Object.assign(new Error("Card payments aren't set up yet."), { status: 400 });
    const s = store.getSettings();
    const base = config.siteUrl;
    const image = (photo) => (photo && base ? `${base}${photo}` : null);
    const session = await client.checkout.sessions.create({
      mode: "payment",
      client_reference_id: order.id,
      metadata: { order_id: order.id, order_number: String(order.number) },
      payment_intent_data: { metadata: { order_id: order.id, order_number: String(order.number) }, description: `${s.name} order #${order.number}` },
      line_items: [
        ...order.items.map((i) => ({
          quantity: i.qty,
          price_data: { currency: "usd", unit_amount: i.priceCents, product_data: { name: i.title.slice(0, 250), ...(image(i.photo) ? { images: [image(i.photo)] } : {}) } },
        })),
        ...(order.shippingCents ? [{ quantity: 1, price_data: { currency: "usd", unit_amount: order.shippingCents, product_data: { name: "Shipping" } } }] : []),
      ],
      ...(order.customer.email ? { customer_email: order.customer.email } : {}),
      ...(order.fulfillment === "ship" ? { shipping_address_collection: { allowed_countries: ["US"] } } : {}),
      phone_number_collection: { enabled: order.channel === "web" && !order.customer.phone },
      // Stripe's shortest is 30 minutes; the items are held a little longer.
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
      success_url: `${base}/order/${order.id}?paid=card&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl ?? `${base}/order/${order.id}`,
    });
    store.setOrderFields(order.id, { stripeSessionId: session.id, method: "stripe" });
    return session.url;
  }

  /** Brings the order up to date from its Checkout Session. */
  async function sync(session) {
    const orderId = session.metadata?.order_id ?? session.client_reference_id;
    const order = orderId ? store.getOrder(orderId) : null;
    if (!order) return null;
    if (session.payment_status === "paid" || session.payment_status === "no_payment_required") {
      const d = session.customer_details;
      const ship = session.collected_information?.shipping_details;
      store.setOrderFields(order.id, {
        customer: {
          ...order.customer,
          name: order.customer.name || d?.name || undefined,
          email: order.customer.email || d?.email || undefined,
          phone: order.customer.phone || d?.phone || undefined,
          ...(ship?.address ? { address: ship.address } : {}),
        },
      });
      const pi = typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null);
      const changed = store.markPaid(order.id, "stripe", pi);
      if (changed) notifier.paid(changed);
      return store.getOrder(order.id);
    }
    // Only when this is still the order's checkout (the buyer may have switched to Bitcoin Cash).
    if (session.status === "expired" && order.stripeSessionId === session.id) store.releaseOrder(order.id, "expired");
    return store.getOrder(order.id);
  }

  async function syncById(sessionId) {
    if (!client || !/^cs_(test|live)_\w+$/.test(String(sessionId))) return null;
    return sync(await client.checkout.sessions.retrieve(sessionId));
  }

  /** Closes the order's Stripe page (the buyer is paying another way). Returns the order, paid if it just was. */
  async function close(order) {
    if (!client || !order.stripeSessionId) return order;
    await client.checkout.sessions.expire(order.stripeSessionId).catch(() => {});
    const session = await client.checkout.sessions.retrieve(order.stripeSessionId);
    if (session.payment_status === "paid") return sync(session);
    store.setOrderFields(order.id, { stripeSessionId: null });
    return store.getOrder(order.id);
  }

  /** Stripe's signed notice: checkout.session.completed / async_payment_succeeded / _failed / expired. */
  async function webhook(rawBody, signature) {
    if (!client || !config.stripeWebhookSecret) throw Object.assign(new Error("Stripe isn't set up."), { status: 400 });
    let event;
    try {
      event = client.webhooks.constructEvent(rawBody, signature ?? "", config.stripeWebhookSecret);
    } catch {
      throw Object.assign(new Error("Invalid signature."), { status: 400 });
    }
    if (event.type.startsWith("checkout.session.")) await sync(event.data.object);
    return { received: true };
  }

  return { enabled, testMode, start, sync, syncById, close, webhook };
}
