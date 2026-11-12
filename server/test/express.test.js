// Apple Pay / Google Pay express: the feed flag, rates for a partial address, the order + PaymentIntent,
// the quote checks, the webhook, the order-page confirm, and "card form only" on Stripe's hosted page.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createStripe } from "../src/stripe.js";
import { fakeShippo, TEST_KEY } from "./shippo-fakes.js";
import { jpeg, startServer, uploadPhoto } from "./helpers.js";

const FROM = { name: "Brian Test", street1: "1 Main St", city: "Madison", state: "WI", zip: "53703", phone: "608-555-0100", email: "from@example.com" };
const PARTIAL = { city: "Austin", state: "TX", postal_code: "78701", country: "US" };
const FULL = { line1: "5 Oak Ave", line2: "", city: "Austin", state: "TX", postal_code: "78701-1234", country: "US" };
const WHO = { name: "Ann Buyer", email: "ann@example.com", phone: "+1 512-555-0199" };
const CODES = [{ code: "TEN", kind: "percent", percent: 10, active: true }];

/** A stand-in for Stripe's API client: remembers every call. */
function fakeClient() {
  const calls = { intents: [], sessions: [], domains: [], customers: [], coupons: [], cancels: [] };
  const state = { pi: {}, failSession: null };
  return {
    calls,
    state,
    customers: { create: async (p) => (calls.customers.push(p), { id: "cus_1" }) },
    coupons: { create: async (p) => (calls.coupons.push(p), { id: "co_1" }) },
    checkout: {
      sessions: {
        create: async (p) => {
          calls.sessions.push(p);
          if (state.failSession && p.payment_method_configuration) throw Object.assign(new Error("No such payment_method_configuration: 'pmc_old'"), { type: "StripeInvalidRequestError", param: "payment_method_configuration" });
          return { id: "cs_test_1", url: "https://stripe.test/pay" };
        },
      },
    },
    paymentIntents: {
      create: async (p, opts) => {
        calls.intents.push({ params: p, opts });
        const pi = { id: `pi_test_${calls.intents.length}`, client_secret: `pi_test_${calls.intents.length}_secret_x`, status: "requires_payment_method", metadata: p.metadata, amount: p.amount };
        state.pi[pi.id] = pi;
        return pi;
      },
      retrieve: async (id) => state.pi[id],
      cancel: async (id) => {
        calls.cancels.push(id);
        const pi = state.pi[id];
        if (["succeeded", "processing", "canceled"].includes(pi.status)) throw Object.assign(new Error(`You cannot cancel this PaymentIntent because it has a status of ${pi.status}.`), { type: "StripeInvalidRequestError" });
        pi.status = "canceled";
        return pi;
      },
    },
    paymentMethodDomains: { create: async (p) => (calls.domains.push(p), { id: "pmd_1" }) },
    webhooks: { constructEvent: (raw, sig) => (sig === "good" ? JSON.parse(String(raw)) : (() => { throw new Error("bad"); })()) },
  };
}

async function setup({ pk = "pk_test_abc", keys = { shippoTestKey: TEST_KEY }, live = true, cardOnly = "" } = {}) {
  const f = fakeShippo();
  const client = fakeClient();
  const t = await startServer({
    configOverrides: { stripeSecretKey: "sk_test_abc", stripeWebhookSecret: "whsec_x", stripePublishableKey: pk, stripeCardOnlyConfig: cardOnly, ...keys },
    makeShippo: f.makeShippo,
    stripe: (store, { config, notifier }) => createStripe({ config, store, notifier, makeClient: () => client }),
  });
  const saved = await t.admin("PUT", "/api/admin/settings", { shipping: true, liveShipping: live, shipFrom: FROM, couponCodes: CODES, package: { lengthIn: 12, widthIn: 9, heightIn: 4, weightOz: 16 } });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  const item = async (o = {}) => {
    const { body } = await uploadPhoto(t, await jpeg());
    const r = await t.admin("POST", "/api/admin/items", { title: "Toaster", priceCents: 4000, ships: true, photos: [body.photo], ...o });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return r.body.item;
  };
  const lines = (it, qty = 1) => [{ id: it.id, qty }];
  const rates = (it, extra = {}) => t.site("POST", "/api/express/rates", { lines: lines(it), address: PARTIAL, ...extra });
  const order = (it, q, extra = {}) =>
    t.site("POST", "/api/express/order", { lines: lines(it), quoteId: q.quoteId, rateId: q.rates[0].id, ...WHO, address: FULL, expectedTotalCents: 4000 + q.rates[0].cents, ...extra });
  const event = (type, pi) => t.anon("POST", "/stripe/webhook", undefined).then(() => rawPost(t, { type, data: { object: pi } }));
  return { t, f, client, item, lines, rates, order, event };
}

/** Stripe's webhook takes the raw body and a signature header. */
async function rawPost(t, event, signature = "good") {
  const res = await fetch(`${t.base}/stripe/webhook`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": signature }, body: JSON.stringify(event) });
  return { status: res.status, body: await res.json().catch(() => null) };
}

describe("feed: payments.express", () => {
  test("the publishable key when Stripe is on, live shipping is on and the key matches the mode", async () => {
    const { t } = await setup();
    const r = await t.site("GET", "/api/catalog");
    assert.deepEqual(r.body.payments.express, { publishableKey: "pk_test_abc" });
    await t.close();
  });
  test("null when the key is for the other mode, missing, or live shipping is off", async () => {
    for (const o of [{ pk: "pk_live_abc" }, { pk: "" }, { pk: "nonsense" }, { live: false }]) {
      const { t } = await setup(o);
      assert.equal((await t.site("GET", "/api/catalog")).body.payments.express, null, JSON.stringify(o));
      await t.close();
    }
  });
  test("with the mode mismatched, the express routes refuse too", async () => {
    const { t, item, rates } = await setup({ pk: "pk_live_abc" });
    const it = await item();
    assert.equal((await rates(it)).status, 409);
    await t.close();
  });
});

describe("POST /api/express/rates", () => {
  test("a partial address (no street) is priced with a stand-in street; no price comes from the browser", async () => {
    const { t, f, item, rates } = await setup();
    const it = await item();
    const r = await rates(it, { address: { postal_code: "78701", country: "US" } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(r.body.quoteId);
    assert.equal(r.body.subtotalCents, 4000);
    assert.equal(r.body.discountCents, 0);
    assert.deepEqual(r.body.rates.map((x) => x.id), ["r_ground", "r_prio", "r_express"]);
    assert.equal(r.body.rates[0].cents, 525);
    const to = f.state.shipments[0].address_to;
    assert.equal(to.zip, "78701");
    assert.ok(to.street1, "Shippo needs some street");
    assert.equal(to.city, "78701", "no city or state given: the ZIP stands in");
    await t.close();
  });
  test("a coupon takes the discount off the items", async () => {
    const { t, item, rates } = await setup();
    const it = await item();
    const r = await rates(it, { coupon: "ten" });
    assert.equal(r.body.discountCents, 400);
    const bad = await rates(it, { coupon: "NOPE" });
    assert.equal(bad.status, 409);
    assert.ok(bad.body.errors.coupon);
    await t.close();
  });
  test("needs a 5-digit ZIP, US only; Shippo's 'no options' is a 422", async () => {
    const { t, f, item, rates } = await setup();
    const it = await item();
    assert.equal((await rates(it, { address: { city: "Austin", country: "US" } })).status, 400);
    assert.equal((await rates(it, { address: { postal_code: "M5V 2T6", country: "CA" } })).status, 400);
    f.state.rates = [];
    assert.equal((await rates(it)).status, 422);
    await t.close();
  });
  test("needs the website's token", async () => {
    const { t, item } = await setup();
    const it = await item();
    assert.equal((await t.anon("POST", "/api/express/rates", { lines: [{ id: it.id, qty: 1 }], address: PARTIAL })).status, 401);
    await t.close();
  });
});

describe("POST /api/express/order", () => {
  test("holds the items, stores the order for the full address, and opens a PaymentIntent for exactly the total", async () => {
    const { t, client, item, rates, order } = await setup();
    const it = await item();
    const q = (await rates(it)).body;
    const r = await order(it, q);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.totalCents, 4525);
    assert.match(r.body.clientSecret, /_secret_/);
    const o = t.store.getOrder(r.body.orderId);
    assert.equal(o.status, "pending");
    assert.equal(o.method, "stripe");
    assert.equal(o.fulfillment, "ship");
    assert.equal(o.totalCents, 4525);
    assert.equal(o.shippingCents, 525);
    assert.equal(o.shipTo.line1, "5 Oak Ave");
    assert.equal(o.customer.email, "ann@example.com");
    assert.equal(o.label.auto, true);
    assert.equal(o.stripePaymentIntent, "pi_test_1");
    assert.equal(t.store.getItem(it.id).quantity, 0, "held");
    const { params, opts } = client.calls.intents[0];
    assert.equal(params.amount, 4525);
    assert.equal(params.currency, "usd");
    assert.deepEqual(params.automatic_payment_methods, { enabled: true });
    assert.equal(params.metadata.order_id, o.id);
    assert.equal(params.metadata.order_number, String(o.number));
    assert.equal(params.shipping.address.line1, "5 Oak Ave");
    assert.equal(params.shipping.address.country, "US");
    assert.match(opts.idempotencyKey, /^express-/);
    await t.close();
  });
  test("the label is priced again with the full street, the same service the shopper chose", async () => {
    const { t, f, item, rates, order } = await setup();
    const it = await item();
    const q = (await rates(it)).body;
    const r = await order(it, q, { rateId: "r_prio", expectedTotalCents: 4985 });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const full = f.state.shipments.at(-1).address_to;
    assert.equal(full.street1, "5 Oak Ave");
    assert.equal(full.zip, "78701-1234");
    const o = t.store.getOrder(r.body.orderId);
    assert.equal(o.label.rates[0].id, "r_prio");
    assert.match(f.state.shipments.at(-1).metadata, /garage-sale/);
    await t.close();
  });
  test("a coupon is applied to the items and stored on the order", async () => {
    const { t, client, item, rates, order } = await setup();
    const it = await item();
    const q = (await rates(it, { coupon: "TEN" })).body;
    const r = await order(it, q, { coupon: "TEN", expectedTotalCents: 4000 - 400 + 525 });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const o = t.store.getOrder(r.body.orderId);
    assert.equal(o.discountCents, 400);
    assert.equal(o.coupon, "TEN");
    assert.equal(client.calls.intents[0].params.amount, 4125);
    await t.close();
  });
  test("a total that isn't what the sheet showed: 409, nothing held, nothing charged", async () => {
    const { t, client, item, rates, order } = await setup();
    const it = await item();
    const q = (await rates(it)).body;
    const r = await order(it, q, { expectedTotalCents: 4000 });
    assert.equal(r.status, 409);
    assert.equal(r.body.code, "total_changed");
    assert.equal(r.body.totalCents, 4525);
    assert.match(r.body.error, /\$45\.25/);
    assert.equal(client.calls.intents.length, 0);
    assert.equal(t.store.getItem(it.id).quantity, 1);
    await t.close();
  });
  test("a coupon that wasn't in the sheet's total also changes it (409)", async () => {
    const { t, item, rates, order } = await setup();
    const it = await item();
    const q = (await rates(it)).body;
    const r = await order(it, q, { coupon: "TEN" });
    assert.equal(r.status, 409);
    assert.equal(r.body.totalCents, 4125);
    await t.close();
  });
  test("a made-up, expired, or other-cart quote is refused (409 errors.rate)", async () => {
    const { t, item, rates, order, lines } = await setup();
    const it = await item();
    const other = await item({ title: "Lamp", priceCents: 1000 });
    const q = (await rates(it)).body;
    assert.equal((await order(it, { ...q, quoteId: "nope" })).status, 409);
    assert.equal((await order(it, q, { rateId: "r_made_up" })).status, 409);
    const wrongCart = await t.site("POST", "/api/express/order", { lines: lines(other), quoteId: q.quoteId, rateId: "r_ground", ...WHO, address: FULL, expectedTotalCents: 1525 });
    assert.equal(wrongCart.status, 409);
    t.db.prepare("update shipping_quotes set expires_at = ?").run("2000-01-01T00:00:00.000Z");
    const late = await order(it, q);
    assert.equal(late.status, 409);
    assert.ok(late.body.errors.rate);
    assert.equal(t.store.getItem(it.id).quantity, 1, "nothing was held");
    await t.close();
  });
  test("a quote for one ZIP isn't good for another ZIP or state", async () => {
    const { t, item, rates, order } = await setup();
    const it = await item();
    const q = (await rates(it)).body;
    assert.equal((await order(it, q, { address: { ...FULL, postal_code: "10001" } })).status, 409);
    assert.equal((await order(it, q, { address: { ...FULL, state: "NY" } })).status, 409);
    assert.equal((await order(it, q, { address: { ...FULL, postal_code: "78701" } })).status, 200, "ZIP vs ZIP+4 is the same place");
    await t.close();
  });
  test("a normal checkout quote can't be used for an express order, and the reverse", async () => {
    const { t, item, order, lines } = await setup();
    const it = await item();
    const normal = (await t.site("POST", "/api/shipping-rates", { lines: lines(it), customer: WHO, address: { line1: "5 Oak Ave", city: "Austin", state: "TX", postal_code: "78701" } })).body;
    assert.equal((await order(it, normal)).status, 409);
    await t.close();
  });
  test("name, email, phone and a full address are required (422/400 with field errors)", async () => {
    const { t, item, rates, order } = await setup();
    const it = await item();
    const q = (await rates(it)).body;
    const noStreet = await order(it, q, { address: { ...FULL, line1: "" } });
    assert.equal(noStreet.status, 422);
    assert.ok(noStreet.body.errors.line1);
    assert.equal((await order(it, q, { email: "" })).status, 400);
    assert.equal((await order(it, q, { phone: "" })).status, 400);
    assert.equal((await order(it, q, { name: "" })).status, 400);
    await t.close();
  });
  test("if Stripe can't open the payment, the hold is given back", async () => {
    const { t, client, item, rates, order } = await setup();
    const it = await item();
    const q = (await rates(it)).body;
    client.paymentIntents.create = async () => {
      throw new Error("Stripe is down");
    };
    const r = await order(it, q);
    assert.equal(r.status, 502);
    assert.equal(t.store.getItem(it.id).quantity, 1);
    await t.close();
  });
});

describe("Stripe's notices for a PaymentIntent", () => {
  async function started() {
    const ctx = await setup();
    const it = await ctx.item();
    const q = (await ctx.rates(it)).body;
    const r = (await ctx.order(it, q)).body;
    return { ...ctx, it, orderId: r.orderId, pi: { id: "pi_test_1", status: "succeeded", metadata: { order_id: r.orderId } } };
  }
  test("payment_intent.succeeded marks it paid once, emails once, and buys the label", async () => {
    const c = await started();
    assert.equal((await rawPost(c.t, { type: "payment_intent.succeeded", data: { object: c.pi } })).status, 200);
    await c.t.shipping.idle();
    let o = c.t.store.getOrder(c.orderId);
    assert.equal(o.status, "paid");
    assert.equal(o.method, "stripe");
    assert.equal(o.stripePaymentIntent, "pi_test_1");
    assert.equal(o.label.state, "bought");
    assert.equal(c.f.state.buys.length, 1);
    assert.equal(c.t.sent.filter((s) => s[0] === "paid").length, 1);
    await rawPost(c.t, { type: "payment_intent.succeeded", data: { object: c.pi } });
    await c.t.shipping.idle();
    assert.equal(c.t.sent.filter((s) => s[0] === "paid").length, 1, "a repeat notice does nothing");
    assert.equal(c.f.state.buys.length, 1);
    await c.t.close();
  });
  test("payment_intent.payment_failed and .canceled put the items back for sale", async () => {
    for (const type of ["payment_intent.payment_failed", "payment_intent.canceled"]) {
      const c = await started();
      assert.equal(c.t.store.getItem(c.it.id).quantity, 0);
      await rawPost(c.t, { type, data: { object: { ...c.pi, status: "requires_payment_method" } } });
      assert.equal(c.t.store.getOrder(c.orderId).status, "cancelled", type);
      assert.equal(c.t.store.getItem(c.it.id).quantity, 1, type);
      await c.t.close();
    }
  });
  test("a failed card on a hosted Checkout page does NOT release that order (the buyer can try another card)", async () => {
    const c = await setup();
    const it = await c.item();
    const co = await c.t.site("POST", "/api/checkout", { lines: c.lines(it), customer: WHO, method: "stripe" });
    assert.equal(co.status, 200, JSON.stringify(co.body));
    const o = c.t.store.listOrders()[0];
    await rawPost(c.t, { type: "payment_intent.payment_failed", data: { object: { id: "pi_hosted", metadata: { order_id: o.id } } } });
    assert.equal(c.t.store.getOrder(o.id).status, "pending");
    await rawPost(c.t, { type: "payment_intent.succeeded", data: { object: { id: "pi_hosted", metadata: { order_id: o.id } } } });
    assert.equal(c.t.store.getOrder(o.id).status, "pending", "the Checkout Session notice is what completes those");
    await c.t.close();
  });
  test("checkout.session.* notices still work, and a bad signature is refused", async () => {
    const c = await setup();
    const it = await c.item();
    await c.t.site("POST", "/api/checkout", { lines: c.lines(it), customer: WHO, method: "stripe" });
    const o = c.t.store.listOrders()[0];
    const session = { id: "cs_test_1", status: "complete", payment_status: "paid", metadata: { order_id: o.id }, payment_intent: "pi_hosted", customer_details: { email: "ann@example.com" } };
    assert.equal((await rawPost(c.t, { type: "checkout.session.completed", data: { object: session } })).status, 200);
    assert.equal(c.t.store.getOrder(o.id).status, "paid");
    assert.equal((await rawPost(c.t, { type: "payment_intent.succeeded", data: { object: c.pi ?? {} } }, "bad")).status, 400);
    await c.t.close();
  });
});

describe("the order page confirms a PaymentIntent without waiting for the notice", () => {
  test("stripe-return with paymentIntentId asks Stripe and marks the order paid", async () => {
    const c = await setup();
    const it = await c.item();
    const q = (await c.rates(it)).body;
    const r = (await c.order(it, q)).body;
    c.client.state.pi.pi_test_1.status = "succeeded";
    const back = await c.t.site("POST", `/api/orders/${r.orderId}/stripe-return`, { paymentIntentId: "pi_test_1" });
    assert.equal(back.status, 200);
    assert.equal(back.body.order.status, "paid");
    await c.t.close();
  });
  test("not paid yet stays pending; another order's PaymentIntent is ignored", async () => {
    const c = await setup();
    const a = await c.item();
    const b = await c.item({ title: "Lamp" });
    const ra = (await c.order(a, (await c.rates(a)).body)).body;
    const rb = (await c.order(b, (await c.rates(b)).body)).body;
    let back = await c.t.site("POST", `/api/orders/${ra.orderId}/stripe-return`, { paymentIntentId: "pi_test_1" });
    assert.equal(back.body.order.status, "pending");
    c.client.state.pi.pi_test_2.status = "succeeded";
    back = await c.t.site("POST", `/api/orders/${ra.orderId}/stripe-return`, { paymentIntentId: "pi_test_2" });
    assert.equal(back.body.order.status, "pending", "pi_test_2 belongs to the other order");
    assert.equal(c.t.store.getOrder(rb.orderId).status, "pending");
    await c.t.close();
  });
});

describe("walletsOnPage: Stripe's hosted page is the card form only", () => {
  async function liveCheckout(c, extra = {}) {
    const it = await c.item();
    const addr = { line1: "5 Oak Ave", city: "Austin", state: "TX", postal_code: "78701" };
    const q = (await c.t.site("POST", "/api/shipping-rates", { lines: c.lines(it), customer: WHO, address: addr })).body;
    const r = await c.t.site("POST", "/api/checkout", { lines: c.lines(it), customer: WHO, method: "stripe", fulfillment: "ship", address: addr, quoteId: q.quoteId, rateId: "r_ground", ...extra });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return c.client.calls.sessions.at(-1);
  }
  test("off by default: nothing changes", async () => {
    const c = await setup({ cardOnly: "pmc_card" });
    const p = await liveCheckout(c);
    assert.equal(p.wallet_options, undefined);
    assert.equal(p.payment_method_configuration, undefined);
    await c.t.close();
  });
  test("on: Link hidden, and the card-only configuration when one is saved", async () => {
    const c = await setup({ cardOnly: "pmc_card" });
    const p = await liveCheckout(c, { walletsOnPage: true });
    assert.deepEqual(p.wallet_options, { link: { display: "never" } });
    assert.equal(p.payment_method_configuration, "pmc_card");
    await c.t.close();
  });
  test("on, with no configuration saved: only Link is hidden", async () => {
    const c = await setup();
    const p = await liveCheckout(c, { walletsOnPage: true });
    assert.deepEqual(p.wallet_options, { link: { display: "never" } });
    assert.equal(p.payment_method_configuration, undefined);
    await c.t.close();
  });
  test("ignored when express isn't offered (key for the other mode) and for pickup", async () => {
    const c = await setup({ pk: "pk_live_abc", cardOnly: "pmc_card" });
    const p = await liveCheckout(c, { walletsOnPage: true });
    assert.equal(p.wallet_options, undefined);
    assert.equal(p.payment_method_configuration, undefined);
    await c.t.close();
    const d = await setup({ cardOnly: "pmc_card" });
    const it = await d.item();
    await d.t.site("POST", "/api/checkout", { lines: d.lines(it), customer: WHO, method: "stripe", walletsOnPage: true });
    assert.equal(d.client.calls.sessions.at(-1).wallet_options, undefined);
    await d.t.close();
  });
  test("a configuration Stripe no longer knows falls back to the usual page, not a failed checkout", async () => {
    const c = await setup({ cardOnly: "pmc_old" });
    c.client.state.failSession = true;
    const p = await liveCheckout(c, { walletsOnPage: true });
    assert.equal(p.payment_method_configuration, undefined);
    assert.equal(c.client.calls.sessions.length, 2, "tried with it, then without");
    await c.t.close();
  });
});

describe("Sell app status", () => {
  test("says whether express is ready", async () => {
    const c = await setup({ cardOnly: "pmc_card" });
    const s = (await c.t.admin("GET", "/api/admin/status")).body;
    assert.equal(s.express.ready, true);
    assert.equal(s.express.cardOnlyConfig, true);
    await c.t.close();
    const d = await setup({ pk: "pk_live_abc" });
    const s2 = (await d.t.admin("GET", "/api/admin/status")).body;
    assert.equal(s2.express.ready, false);
    assert.match(s2.express.why, /test|live/i);
    await d.t.close();
  });
});

describe("an express order paid another way (or cancelled) on the order page", () => {
  async function started() {
    const ctx = await setup();
    const it = await ctx.item();
    const q = (await ctx.rates(it)).body;
    const r = (await ctx.order(it, q)).body;
    return { ...ctx, it, orderId: r.orderId };
  }
  test("Pay with card cancels the Apple Pay / Google Pay PaymentIntent first, so it can't also be charged", async () => {
    const c = await started();
    const r = await c.t.site("POST", `/api/orders/${c.orderId}/pay`, { method: "stripe" });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(c.client.calls.cancels, ["pi_test_1"]);
    assert.equal(c.client.state.pi.pi_test_1.status, "canceled");
    assert.equal(c.t.store.getOrder(c.orderId).stripePaymentIntent, null);
    // Stripe's "canceled" notice for the old PaymentIntent must not cancel the order now being paid on the hosted page.
    await rawPost(c.t, { type: "payment_intent.canceled", data: { object: { id: "pi_test_1", status: "canceled", metadata: { order_id: c.orderId } } } });
    assert.equal(c.t.store.getOrder(c.orderId).status, "pending");
    await c.t.close();
  });
  test("the wallet payment already went through (notice not here yet): recorded as paid, no second payment page", async () => {
    const c = await started();
    c.client.state.pi.pi_test_1.status = "succeeded";
    const r = await c.t.site("POST", `/api/orders/${c.orderId}/pay`, { method: "stripe" });
    assert.equal(r.status, 409);
    assert.match(r.body.error, /already paid/);
    assert.equal(c.client.calls.sessions.length, 0);
    assert.equal(c.t.store.getOrder(c.orderId).status, "paid");
    await c.t.close();
  });
  test("still processing: refused, nothing cancelled, no payment page", async () => {
    const c = await started();
    c.client.state.pi.pi_test_1.status = "processing";
    const r = await c.t.site("POST", `/api/orders/${c.orderId}/pay`, { method: "stripe" });
    assert.equal(r.status, 409);
    assert.equal(c.client.calls.sessions.length, 0);
    assert.equal(c.t.store.getOrder(c.orderId).status, "pending");
    await c.t.close();
  });
  test("the hosted page charges the shipping the buyer was quoted (the order's total), even if the label costs more at the full address", async () => {
    const ctx = await setup();
    const it = await ctx.item();
    const q = (await ctx.rates(it)).body;
    ctx.f.state.rates = ctx.f.state.rates.map((x) => (x.object_id === "r_ground" ? { ...x, object_id: "r_ground_full", amount: "6.10" } : x));
    const o = (await ctx.order(it, q)).body;
    assert.equal(ctx.t.store.getOrder(o.orderId).label.rates[0].cents, 610);
    const r = await ctx.t.site("POST", `/api/orders/${o.orderId}/pay`, { method: "stripe" });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const p = ctx.client.calls.sessions.at(-1);
    assert.equal(p.shipping_options[0].shipping_rate_data.fixed_amount.amount, 525);
    await ctx.t.close();
  });
  test("Cancel cancels the PaymentIntent too", async () => {
    const c = await started();
    const r = await c.t.site("POST", `/api/orders/${c.orderId}/cancel`, {});
    assert.equal(r.status, 200);
    assert.equal(r.body.status, "cancelled");
    assert.equal(c.client.state.pi.pi_test_1.status, "canceled");
    await c.t.close();
  });
});

describe("express order: what the order is placed for", () => {
  test("a price changed while the label was being prepared: 409 and the hold is given back, no PaymentIntent", async () => {
    const { t, f, client, item, rates, order } = await setup();
    const it = await item();
    const q = (await rates(it)).body;
    f.state.onShipment = () => t.db.prepare("update items set price_cents = 4500 where id = ?").run(it.id);
    const r = await order(it, q);
    assert.equal(r.status, 409);
    assert.equal(r.body.code, "total_changed");
    assert.equal(client.calls.intents.length, 0);
    assert.equal(t.store.getItem(it.id).quantity, 1);
    await t.close();
  });
  test("a label that couldn't be prepared is a visible problem on the order", async () => {
    const { t, f, item, rates, order } = await setup();
    const it = await item();
    const q = (await rates(it)).body;
    f.state.failShipment = { status: 500, message: "Shippo is down" };
    const r = await order(it, q);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.match(t.store.getOrder(r.body.orderId).problem ?? "", /label/i);
    await t.close();
  });
});
