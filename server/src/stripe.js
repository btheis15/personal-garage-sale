/**
 * Card payments through Stripe Checkout, with your own Stripe account (STRIPE_SECRET_KEY in .env).
 * Stripe hosts the card form, so card numbers never touch the website or this Mac; Apple Pay,
 * Google Pay and Link come with it. Express checkout (Apple Pay / Google Pay on the website's own page) uses a PaymentIntent
 * instead. Stripe tells this server when a payment goes through (<PUBLIC_URL>/stripe/webhook); the website's order page also asks,
 * in case that's slow.
 */
import Stripe from "stripe";

const stripeAddress = (a) => ({ line1: a.line1, ...(a.line2 ? { line2: a.line2 } : {}), city: a.city, state: a.state, postal_code: a.postal_code, country: "US" });

export function createStripe({ config, store, notifier, makeClient = (key) => new Stripe(key) }) {
  const key = config.stripeSecretKey;
  const enabled = /^(sk|rk)_(test|live)_/.test(key);
  const testMode = /^(sk|rk)_test_/.test(key);
  const client = enabled ? makeClient(key) : null;
  // The publishable key for Apple Pay / Google Pay on the website, only if it's for the same mode as the secret key.
  const pk = config.stripePublishableKey ?? "";
  const publishableKey = enabled && pk === pk.trim() && new RegExp(`^pk_${testMode ? "test" : "live"}_\\w+$`).test(pk) ? pk : null;
  /** A pk for the other mode (or one that isn't a pk): says why express is off. */
  const publishableProblem = !pk ? "Add STRIPE_PUBLISHABLE_KEY to turn on Apple Pay / Google Pay." : publishableKey ? null : `STRIPE_PUBLISHABLE_KEY must be a ${testMode ? "pk_test_" : "pk_live_"} key to match the secret key (${testMode ? "test" : "live"} mode).`;

  /** A Stripe Checkout page for the order. Returns its address. */
  async function start(order, { cancelUrl, walletsOnPage = false } = {}) {
    if (!client) throw Object.assign(new Error("Card payments aren't set up yet."), { status: 400 });
    const s = store.getSettings();
    const base = config.siteUrl;
    // A live Shippo price the buyer chose on the website: Stripe gets their address (through a Customer, so its page asks for none)
    // and one fixed shipping option with that exact price.
    const live = order.fulfillment === "ship" && order.shipTo && order.label?.auto ? order.label.rates?.[0] : null;
    const phone = String(order.customer.phone ?? "").replace(/[^\d+]/g, "").slice(0, 20) || undefined;
    const stripeCustomer = live
      ? await client.customers.create(
          { name: order.customer.name, email: order.customer.email, phone, address: stripeAddress(order.shipTo), shipping: { name: order.customer.name || "Customer", phone, address: stripeAddress(order.shipTo) }, metadata: { order_id: order.id, order_number: String(order.number) } },
          { idempotencyKey: `customer-${order.id}` },
        )
      : null;
    const image = (photo) => (photo && base ? `${base}${photo}` : null);
    // A coupon code: a one-off Stripe coupon for exactly this order's discount (needs the key's "Coupons: write" permission).
    const coupon = order.discountCents > 0 ? await client.coupons.create({ amount_off: order.discountCents, currency: "usd", duration: "once", max_redemptions: 1, name: String(order.coupon ?? "Coupon").slice(0, 40) }, { idempotencyKey: `coupon-${order.id}` }) : null;
    // The website shows Apple Pay / Google Pay above the form (walletsOnPage): Stripe's page is the card form only. Stripe has no
    // per-session switch for those two wallets on a hosted page (wallet_options only has link.display), so the documented way is a
    // payment method configuration with apple_pay, google_pay and link off (npm run card-only-config → STRIPE_CARD_ONLY_CONFIG).
    // https://docs.stripe.com/payments/payment-method-configurations
    const cardOnly = walletsOnPage && Boolean(publishableKey) && Boolean(live);
    const params = {
      ui_mode: "hosted_page",
      mode: "payment",
      billing_address_collection: "auto",
      automatic_tax: { enabled: false },
      allow_promotion_codes: false,
      ...(coupon ? { discounts: [{ coupon: coupon.id }] } : {}),
      submit_type: "auto",
      integration_identifier: "hosted_web_0002",
      origin_context: "web",
      branding_settings: { background_color: "#ffffff", button_color: "#0074d4", font_family: "default", border_style: "rounded" },
      client_reference_id: order.id,
      metadata: { order_id: order.id, order_number: String(order.number) },
      payment_intent_data: { metadata: { order_id: order.id, order_number: String(order.number) }, description: `${s.name} order #${order.number}` },
      line_items: [
        ...order.items.map((i) => ({
          quantity: i.qty,
          price_data: { currency: "usd", unit_amount: i.priceCents, product_data: { name: i.title.slice(0, 250), ...(image(i.photo) ? { images: [image(i.photo)] } : {}) } },
        })),
        ...(order.shippingCents && !live ? [{ quantity: 1, price_data: { currency: "usd", unit_amount: order.shippingCents, product_data: { name: "Shipping" } } }] : []),
      ],
      ...(live
        ? {
            customer: stripeCustomer.id,
            // The order's own shipping (what the buyer was quoted), not the label's price: an express order's label can be re-priced.
            shipping_options: [{ shipping_rate_data: { type: "fixed_amount", display_name: live.label, fixed_amount: { amount: order.shippingCents, currency: "usd" } } }],
          }
        : {
            ...(order.customer.email ? { customer_email: order.customer.email } : {}),
            ...(order.fulfillment === "ship" ? { shipping_address_collection: { allowed_countries: ["US"] } } : {}),
          }),
      phone_number_collection: { enabled: order.channel === "web" && !order.customer.phone },
      // Stripe's shortest is 30 minutes; the items are held a little longer.
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
      success_url: `${base}/order/${order.id}?paid=card&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl ?? `${base}/order/${order.id}`,
    };
    const cardOnlyParams = cardOnly ? { wallet_options: { link: { display: "never" } }, ...(config.stripeCardOnlyConfig ? { payment_method_configuration: config.stripeCardOnlyConfig } : {}) } : {};
    let session;
    try {
      session = await client.checkout.sessions.create({ ...params, ...cardOnlyParams });
    } catch (e) {
      // A card-only configuration Stripe doesn't know (deleted, or from the other mode): the usual page, not a failed checkout.
      if (!cardOnlyParams.payment_method_configuration || !/payment_method_configuration/.test(`${e.param ?? ""} ${e.message}`)) throw e;
      console.error(`[stripe] card-only configuration not usable (${e.message}); using the usual page`);
      session = await client.checkout.sessions.create({ ...params, wallet_options: cardOnlyParams.wallet_options });
    }
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

  /**
   * Express (Apple Pay / Google Pay): a PaymentIntent for exactly the order's total, created after the sheet is approved.
   * The order id rides in metadata so the notice finds it. No receipt_email: the shop sends its own receipt (with receipt_email Stripe
   * also sends one in live mode, which would double it).
   */
  async function createIntent(order) {
    if (!client) throw Object.assign(new Error("Card payments aren't set up yet."), { status: 400 });
    const s = store.getSettings();
    const phone = String(order.customer.phone ?? "").replace(/[^\d+]/g, "").slice(0, 20) || undefined;
    const pi = await client.paymentIntents.create(
      {
        amount: order.totalCents,
        currency: "usd",
        automatic_payment_methods: { enabled: true },
        description: `${s.name} order #${order.number}`,
        metadata: { order_id: order.id, order_number: String(order.number), express: "1", ...(order.coupon ? { coupon: order.coupon } : {}) },
        shipping: { name: order.customer.name || "Customer", phone, address: stripeAddress(order.shipTo) },
      },
      { idempotencyKey: `express-${order.id}` },
    );
    store.setOrderFields(order.id, { stripePaymentIntent: pi.id, method: "stripe" });
    return pi;
  }

  /**
   * Brings an EXPRESS order up to date from its PaymentIntent. Only the order's own PaymentIntent counts (the one createIntent saved):
   * a hosted Checkout page's card can fail and be retried, so those orders are finished by their Checkout Session notice instead.
   */
  function syncIntent(pi) {
    const orderId = pi?.metadata?.order_id;
    const order = orderId ? store.getOrder(orderId) : null;
    if (!order || !pi.id || order.stripePaymentIntent !== pi.id || order.stripeSessionId) return null;
    if (pi.status === "succeeded") {
      const changed = store.markPaid(order.id, "stripe", pi.id);
      if (changed) notifier.paid(changed);
    } else if (pi.status === "canceled" || pi.status === "requires_payment_method") {
      // Failed or cancelled: the items go back on sale (so the shopper can try the sheet again).
      store.releaseOrder(order.id, "cancelled");
    }
    return store.getOrder(order.id);
  }

  /** The order page came back from the wallet: ask Stripe now (only for this order's own PaymentIntent). */
  async function syncIntentById(orderId, intentId) {
    if (!client || !/^pi_\w+$/.test(String(intentId))) return null;
    const pi = await client.paymentIntents.retrieve(intentId);
    if (pi?.metadata?.order_id !== orderId) return null;
    // Only a payment that went through counts here: "requires_payment_method" just means the shopper hasn't paid (yet).
    return pi.status === "succeeded" ? syncIntent(pi) : null;
  }

  /**
   * Express: the order's own PaymentIntent is given up before the buyer pays another way or cancels, so it can never also be charged.
   * Returns the order (paid, if that payment had already gone through). Throws 409 while it's still going through.
   */
  async function closeIntent(order) {
    if (!client || order.status !== "pending" || !order.stripePaymentIntent || order.stripeSessionId) return order;
    const busy = () => Object.assign(new Error("Your Apple Pay / Google Pay payment is still going through. Please wait a minute and refresh this page."), { status: 409 });
    let pi = await client.paymentIntents.retrieve(order.stripePaymentIntent);
    if (pi.status !== "succeeded" && pi.status !== "canceled") {
      if (["processing", "requires_capture"].includes(pi.status)) throw busy();
      try {
        pi = await client.paymentIntents.cancel(pi.id);
      } catch {
        pi = await client.paymentIntents.retrieve(pi.id); // paid meanwhile?
      }
    }
    if (pi.status === "succeeded") return syncIntent(pi) ?? store.getOrder(order.id);
    if (pi.status !== "canceled") throw busy();
    // Forgotten, so its "canceled" notice doesn't cancel the order the buyer is now paying another way.
    store.setOrderFields(order.id, { stripePaymentIntent: null });
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
    else if (["payment_intent.succeeded", "payment_intent.payment_failed", "payment_intent.canceled"].includes(event.type)) {
      const pi = event.data.object;
      // payment_failed leaves the PaymentIntent waiting for another try: treat it as failed here, the hold is given back.
      syncIntent(event.type === "payment_intent.payment_failed" ? { ...pi, status: "requires_payment_method" } : pi);
    }
    return { received: true };
  }

  return { enabled, testMode, publishableKey, publishableProblem, cardOnlyConfig: Boolean(config.stripeCardOnlyConfig), start, createIntent, closeIntent, syncIntent, syncIntentById, sync, syncById, close, webhook };
}
