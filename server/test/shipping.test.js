// Live Shippo shipping: rates, quotes, checkout, the Stripe session, labels on paid, and the Sell app's tools.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createStripe } from "../src/stripe.js";
import { parcelFor, pickRates, ratesOf } from "../src/shipping.js";
import { trackingUrl } from "../src/shippo.js";
import { DEFAULT_SETTINGS } from "../src/site.js";
import { LIVE_KEY, TEST_KEY, fakeShippo, USUAL_RATES } from "./shippo-fakes.js";
import { jpeg, startServer, uploadPhoto } from "./helpers.js";

const FROM = { name: "Brian Test", street1: "1 Main St", city: "Madison", state: "WI", zip: "53703", phone: "608-555-0100", email: "from@example.com" };
const ADDR = { line1: "5 Oak Ave", line2: "", city: "Austin", state: "TX", postal_code: "78701" };
const BUYER = { name: "Ann Buyer", email: "ann@example.com", phone: "512-555-0199" };

async function setup({ keys = { shippoTestKey: TEST_KEY }, live = true, stripe, bch } = {}) {
  const f = fakeShippo();
  const t = await startServer({ configOverrides: keys, makeShippo: f.makeShippo, ...(stripe ? { stripe } : {}), ...(bch ? { bch } : {}) });
  const saved = await t.admin("PUT", "/api/admin/settings", { shipping: true, liveShipping: live, shipFrom: FROM, package: { lengthIn: 12, widthIn: 9, heightIn: 4, weightOz: 16 } });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  const item = async (o = {}) => {
    const { body } = await uploadPhoto(t, await jpeg());
    const r = await t.admin("POST", "/api/admin/items", { title: "Toaster", priceCents: 1200, ships: true, photos: [body.photo], ...o });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return r.body.item;
  };
  return { t, f, item };
}
const lines = (it, qty = 1) => [{ id: it.id, qty }];
const rates = (t, it, extra = {}) => t.site("POST", "/api/shipping-rates", { lines: lines(it), customer: BUYER, address: ADDR, ...extra });

describe("rate picking", () => {
  test("three picks: cheapest, cheapest USPS Priority (not Express), fastest; each once; sorted by price", () => {
    const picked = pickRates(ratesOf({ rates: USUAL_RATES() }));
    assert.deepEqual(picked.map((r) => r.id), ["r_ground", "r_prio", "r_express"]);
  });
  test("the same rate is shown once, and a lone rate is one pick", () => {
    const one = [{ object_id: "a", provider: "USPS", servicelevel: { name: "Ground Advantage", token: "usps_ground_advantage" }, amount: "5.00", currency: "USD", estimated_days: 2 }];
    assert.deepEqual(pickRates(ratesOf({ rates: one })).map((r) => r.id), ["a"]);
  });
  test("0 or blank estimated days are never treated as 'fastest at zero': overnight counts as 1 day, blank is skipped", () => {
    const r = ratesOf({ rates: [{ object_id: "x", provider: "USPS", servicelevel: { name: "A", token: "a" }, amount: "5.00", currency: "USD", estimated_days: 0 }, { object_id: "y", provider: "UPS", servicelevel: { name: "B", token: "b" }, amount: "9.00", currency: "USD", estimated_days: null }] });
    assert.equal(r[0].days, 1);
    assert.equal(r[1].days, null);
    assert.deepEqual(pickRates(r).map((p) => p.id), ["x"], "the cheapest is also the fastest, so it shows once");
  });
  test("a $0 or non-USD rate is ignored", () => {
    const r = ratesOf({ rates: [{ object_id: "z", provider: "USPS", servicelevel: { name: "Z", token: "z" }, amount: "0.00", currency: "USD", estimated_days: 2 }, { object_id: "w", provider: "USPS", servicelevel: { name: "W", token: "w" }, amount: "4.00", currency: "EUR", estimated_days: 2 }] });
    assert.deepEqual(pickRates(r), []);
  });
  test("tracking links", () => {
    assert.match(trackingUrl("usps", "123"), /tLabels=123/);
    assert.equal(trackingUrl("nope", "1"), null);
  });
});

test("parcel: weight is qty × item weight (else the default), box is the biggest item box by volume, else the default box", () => {
  const s = { ...DEFAULT_SETTINGS, package: { lengthIn: 12, widthIn: 9, heightIn: 4, weightOz: 16 } };
  assert.deepEqual(parcelFor(s, [{ qty: 2, weightOz: 10, box: null }, { qty: 1, weightOz: null, box: null }]), { lengthIn: 12, widthIn: 9, heightIn: 4, weightOz: 36 });
  assert.deepEqual(parcelFor(s, [{ qty: 1, weightOz: 5, box: [4, 4, 4] }, { qty: 1, weightOz: 5, box: [10, 8, 6] }]), { lengthIn: 10, widthIn: 8, heightIn: 6, weightOz: 10 });
});

describe("settings and items", () => {
  test("validation: ship-from, package, item weight and box", async () => {
    const { t, item } = await setup();
    try {
      assert.equal((await t.admin("PUT", "/api/admin/settings", { shipFrom: { state: "Wisconsin" } })).status, 400);
      assert.equal((await t.admin("PUT", "/api/admin/settings", { shipFrom: { zip: "abc" } })).status, 400);
      assert.equal((await t.admin("PUT", "/api/admin/settings", { package: { weightOz: 0 } })).status, 400);
      assert.equal((await t.admin("PUT", "/api/admin/settings", { package: { weightOz: 2000 } })).status, 400);
      assert.equal((await t.admin("POST", "/api/admin/items", { title: "x", priceCents: 1, weightOz: 5000 })).status, 400);
      assert.equal((await t.admin("POST", "/api/admin/items", { title: "x", priceCents: 1, boxLengthIn: 5 })).status, 400, "a box needs all three sides");
      const ok = await item({ weightOz: 12.5, boxLengthIn: 10, boxWidthIn: 8, boxHeightIn: 6 });
      assert.equal(ok.weightOz, 12.5);
      assert.equal(ok.boxHeightIn, 6);
      const feed = (await t.site("GET", "/api/catalog")).body;
      assert.equal(feed.items.find((i) => i.id === ok.id).weightOz, undefined, "the website doesn't get packing details");
    } finally {
      await t.close();
    }
  });
});

describe("quotes and checkout", () => {
  test("flag off = the old flat shipping, no quote needed, nothing sent to Shippo", async () => {
    const { t, f, item } = await setup({ live: false });
    try {
      const it = await item();
      assert.equal((await t.site("GET", "/api/catalog")).body.payments.liveShipping, false);
      assert.equal((await rates(t, it)).status, 409);
      const r = await t.site("POST", "/api/checkout", { lines: lines(it), customer: BUYER, method: "stripe", fulfillment: "ship" });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      const order = t.store.listOrders()[0];
      assert.equal(order.shippingCents, 1000, "default flat shipping");
      assert.equal(order.label, null);
      assert.equal(f.state.shipments.length, 0);
    } finally {
      await t.close();
    }
  });

  test("live: /api/shipping-rates returns up to 3 exact rates; the feed says liveShipping", async () => {
    const { t, f, item } = await setup();
    try {
      const it = await item({ weightOz: 20 });
      assert.equal((await t.site("GET", "/api/catalog")).body.payments.liveShipping, true);
      const r = await rates(t, it);
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.rates.length, 3);
      assert.deepEqual(r.body.rates.map((x) => x.cents), [525, 985, 3100]);
      assert.ok(r.body.quoteId && r.body.expiresAt);
      const sent = f.state.shipments[0];
      assert.equal(sent.address_from.name, "Brian Test");
      assert.equal(sent.address_from.phone, "608-555-0100");
      assert.equal(sent.parcels[0].weight, "20");
      assert.equal(sent.address_to.zip, "78701");
      assert.deepEqual(f.state.keysUsed, [TEST_KEY]);
    } finally {
      await t.close();
    }
  });

  test("address errors are keyed by field; Shippo's own refusal is a 422; no options is a 422", async () => {
    const { t, f, item } = await setup();
    try {
      const it = await item();
      const bad = await rates(t, it, { address: { line1: "", city: "", state: "Texas", postal_code: "1" } });
      assert.equal(bad.status, 400);
      assert.deepEqual(Object.keys(bad.body.errors).sort(), ["city", "line1", "postal_code", "state"]);
      f.state.failShipment = { status: 400, message: "Invalid zip code" };
      const refused = await rates(t, it);
      assert.equal(refused.status, 422);
      assert.ok(refused.body.errors.postal_code);
      f.state.failShipment = null;
      f.state.rates = [];
      const none = await rates(t, it);
      assert.equal(none.status, 422);
      assert.match(none.body.error, /No shipping options came back for that address/);
    } finally {
      await t.close();
    }
  });

  test("checkout needs a quote when live; the chosen rate sets the shipping price", async () => {
    const { t, item } = await setup();
    try {
      const it = await item();
      const base = { lines: lines(it), customer: BUYER, method: "stripe", fulfillment: "ship", address: ADDR };
      const none = await t.site("POST", "/api/checkout", base);
      assert.equal(none.status, 409);
      assert.equal(none.body.error, "Choose a shipping option.");
      assert.ok(none.body.errors.rate);
      const q = (await rates(t, it)).body;
      const ok = await t.site("POST", "/api/checkout", { ...base, quoteId: q.quoteId, rateId: "r_prio" });
      assert.equal(ok.status, 200, JSON.stringify(ok.body));
      const order = t.store.listOrders()[0];
      assert.equal(order.shippingCents, 985);
      assert.equal(order.totalCents, 1200 + 985);
      assert.equal(order.shipTo.city, "Austin");
      assert.equal(order.label.auto, true);
    } finally {
      await t.close();
    }
  });

  test("quote tampering: another rate id, another cart, another address, an expired quote, another mode", async () => {
    const { t, item } = await setup();
    try {
      const it = await item();
      const other = await item({ title: "Lamp", priceCents: 900 });
      const q = (await rates(t, it)).body;
      const go = (o) => t.site("POST", "/api/checkout", { lines: lines(it), customer: BUYER, method: "stripe", fulfillment: "ship", address: ADDR, quoteId: q.quoteId, rateId: "r_ground", ...o });
      assert.equal((await go({ rateId: "r_made_up" })).status, 409);
      const cart = await go({ lines: lines(other) });
      assert.equal(cart.status, 409);
      assert.match(cart.body.error, /Shipping options changed/);
      assert.equal((await go({ address: { ...ADDR, postal_code: "78702" } })).status, 409);
      assert.equal((await go({ quoteId: "nope" })).status, 409);
      // Another mode: the quote was made in test mode, as if Stripe had flipped to live since.
      t.db.prepare("update shipping_quotes set mode = 'live' where id = ?").run(q.quoteId);
      assert.match((await go({})).body.error, /Shipping options changed/);
      t.db.prepare("update shipping_quotes set mode = 'test', expires_at = ? where id = ?").run(new Date(Date.now() - 1000).toISOString(), q.quoteId);
      assert.match((await go({})).body.error, /expired/);
      assert.equal(t.store.listOrders().length, 0, "nothing was held");
    } finally {
      await t.close();
    }
  });

  test("address spacing and case don't invalidate a quote", async () => {
    const { t, item } = await setup();
    try {
      const it = await item();
      const q = (await rates(t, it)).body;
      const r = await t.site("POST", "/api/checkout", { lines: lines(it), customer: BUYER, method: "stripe", fulfillment: "ship", address: { ...ADDR, line1: "  5  OAK ave ", city: "austin" }, quoteId: q.quoteId, rateId: "r_ground" });
      assert.equal(r.status, 200, JSON.stringify(r.body));
    } finally {
      await t.close();
    }
  });

  test("test mode never uses the live key: with only a live key, live shipping is simply off", async () => {
    const { t, f, item } = await setup({ keys: { shippoLiveKey: LIVE_KEY } });
    try {
      const it = await item();
      assert.equal((await t.site("GET", "/api/catalog")).body.payments.liveShipping, false);
      assert.equal((await rates(t, it)).status, 409);
      const s = (await t.admin("GET", "/api/admin/settings")).body;
      assert.deepEqual(s.shippo, { mode: "test", connected: false });
      assert.deepEqual(f.state.keysUsed, []);
    } finally {
      await t.close();
    }
  });

  test("with both keys, Stripe in test mode uses the test key", async () => {
    const { t, f, item } = await setup({ keys: { shippoLiveKey: LIVE_KEY, shippoTestKey: TEST_KEY } });
    try {
      const it = await item();
      assert.equal((await rates(t, it)).status, 200);
      assert.deepEqual(f.state.keysUsed, [TEST_KEY]);
    } finally {
      await t.close();
    }
  });

  test("a key in the wrong slot (a live key as the test key) is not used", async () => {
    const { t } = await setup({ keys: { shippoTestKey: LIVE_KEY } });
    try {
      assert.equal((await t.site("GET", "/api/catalog")).body.payments.liveShipping, false);
    } finally {
      await t.close();
    }
  });

  test("an incomplete ship-from (no phone) keeps live shipping off", async () => {
    const { t } = await setup();
    try {
      await t.admin("PUT", "/api/admin/settings", { shipFrom: { phone: "" } });
      assert.equal((await t.site("GET", "/api/catalog")).body.payments.liveShipping, false);
    } finally {
      await t.close();
    }
  });
});

describe("Stripe session when live", () => {
  test("address through a Customer, one fixed shipping option, no address collection or shipping line item", async () => {
    const { t, item } = await setup();
    try {
      const it = await item();
      const q = (await rates(t, it)).body;
      const order = t.store.placeOrder({ lines: lines(it), customer: BUYER, fulfillment: "ship", method: "stripe", holdMinutes: 35, shippingOverrideCents: 985, shipTo: { ...ADDR, country: "US" }, label: { state: "rates", auto: true, rates: [{ id: "r_prio", label: "USPS Priority Mail", cents: 985, provider: "USPS" }] } });
      const calls = { customers: [], sessions: [] };
      const client = {
        customers: { create: async (p) => (calls.customers.push(p), { id: "cus_1" }) },
        checkout: { sessions: { create: async (p) => (calls.sessions.push(p), { id: "cs_test_1", url: "https://stripe.test/pay" }) } },
      };
      const stripe = createStripe({ config: { stripeSecretKey: "sk_test_abc123", siteUrl: "https://shop.test" }, store: t.store, notifier: {}, makeClient: () => client });
      assert.equal(await stripe.start(order), "https://stripe.test/pay");
      const c = calls.customers[0];
      assert.equal(c.shipping.address.postal_code, "78701");
      assert.equal(c.shipping.address.country, "US");
      assert.equal(c.shipping.phone, "512-555-0199".replace(/[^\d+]/g, ""));
      const p = calls.sessions[0];
      assert.equal(p.customer, "cus_1");
      assert.equal(p.customer_email, undefined);
      assert.equal(p.shipping_address_collection, undefined);
      assert.equal(p.shipping_options.length, 1);
      assert.deepEqual(p.shipping_options[0].shipping_rate_data.fixed_amount, { amount: 985, currency: "usd" });
      assert.equal(p.shipping_options[0].shipping_rate_data.display_name, "USPS Priority Mail");
      assert.ok(!p.line_items.some((l) => l.price_data.product_data.name === "Shipping"));
      assert.equal(q.rates.length, 3);
    } finally {
      await t.close();
    }
  });

  test("an old-style ship order (flat price) is unchanged: address collection and a Shipping line", async () => {
    const { t, item } = await setup({ live: false });
    try {
      const it = await item();
      const order = t.store.placeOrder({ lines: lines(it), customer: BUYER, fulfillment: "ship", method: "stripe", holdMinutes: 35, defaultShippingCents: 1000 });
      const sessions = [];
      const client = { checkout: { sessions: { create: async (p) => (sessions.push(p), { id: "cs_test_2", url: "u" }) } } };
      await createStripe({ config: { stripeSecretKey: "sk_test_abc123", siteUrl: "https://shop.test" }, store: t.store, notifier: {}, makeClient: () => client }).start(order);
      assert.deepEqual(sessions[0].shipping_address_collection, { allowed_countries: ["US"] });
      assert.equal(sessions[0].shipping_options, undefined);
      assert.equal(sessions[0].customer_email, "ann@example.com");
      assert.ok(sessions[0].line_items.some((l) => l.price_data.product_data.name === "Shipping"));
    } finally {
      await t.close();
    }
  });
});

describe("labels", () => {
  async function paidLiveOrder(ctx, { method = "stripe" } = {}) {
    const it = await ctx.item();
    const q = (await rates(ctx.t, it)).body;
    const r = await ctx.t.site("POST", "/api/checkout", { lines: lines(it), customer: BUYER, method, fulfillment: "ship", address: ADDR, quoteId: q.quoteId, rateId: "r_prio" });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return ctx.t.store.listOrders()[0];
  }

  test("auto-buy on paid: bought for the chosen rate, order NOT shipped, tracking emailed, order notes the label", async () => {
    const ctx = await setup();
    try {
      const o = await paidLiveOrder(ctx);
      ctx.t.store.markPaid(o.id, "stripe");
      await ctx.t.shipping.idle();
      const after = ctx.t.store.getOrder(o.id);
      assert.equal(ctx.f.state.buys.length, 1);
      assert.equal(ctx.f.state.buys[0].rateId, "r_prio");
      assert.equal(ctx.f.state.buys[0].metadata, `garage-sale order #${o.number}`);
      assert.equal(after.label.state, "bought");
      assert.equal(after.shippedAt, null, "not marked shipped");
      assert.equal(after.status, "paid");
      assert.equal(after.trackingNumber, "9400111899223197428490");
      assert.match(after.trackingUrl, /usps/);
      assert.equal(after.problem, null);
      assert.ok(ctx.t.sent.some((s) => s[0] === "tracking" && s[2] === "9400111899223197428490"));
      assert.match(after.notes, /Label bought/);
    } finally {
      await ctx.t.close();
    }
  });

  test("a Bitcoin Cash order with live shipping uses the quote too, and its label is bought when paid", async () => {
    const ctx = await setup({ bch: { enabled: true, stop() {} } });
    try {
      const o = await paidLiveOrder(ctx, { method: "bch" });
      assert.equal(o.shippingCents, 985);
      ctx.t.store.markPaid(o.id, "bch");
      await ctx.t.shipping.idle();
      assert.equal(ctx.t.store.getOrder(o.id).label.state, "bought");
    } finally {
      await ctx.t.close();
    }
  });

  test("paying twice buys one label", async () => {
    const ctx = await setup();
    try {
      const o = await paidLiveOrder(ctx);
      ctx.t.store.markPaid(o.id, "stripe");
      ctx.t.store.markPaid(o.id, "stripe");
      await ctx.t.shipping.idle();
      assert.equal(ctx.f.state.buys.length, 1);
    } finally {
      await ctx.t.close();
    }
  });

  test("auto-buy failure: no shipment, a visible problem note and an owner alert; the owner can still Get rates and buy by hand", async () => {
    const ctx = await setup();
    try {
      const o = await paidLiveOrder(ctx);
      ctx.f.state.buy = "fail";
      ctx.t.store.markPaid(o.id, "stripe");
      await ctx.t.shipping.idle();
      let after = ctx.t.store.getOrder(o.id);
      assert.match(after.problem, /couldn't be bought automatically/);
      assert.equal(after.shippedAt, null);
      assert.ok(ctx.t.sent.some((s) => s[0] === "problem"));
      assert.equal(ctx.t.sent.some((s) => s[0] === "tracking"), false);
      // By hand.
      ctx.f.state.buy = "ok";
      const got = await ctx.t.admin("POST", `/api/admin/orders/${o.id}/label/rates`, {});
      assert.equal(got.status, 200, JSON.stringify(got.body));
      assert.equal(got.body.order.label.rates.length >= 3, true);
      assert.equal(ctx.f.state.shipments.at(-1).metadata, `garage-sale order #${o.number}`);
      const bought = await ctx.t.admin("POST", `/api/admin/orders/${o.id}/label/buy`, { rateId: "r_ground" });
      assert.equal(bought.status, 200, JSON.stringify(bought.body));
      assert.equal(bought.body.order.label.state, "bought");
      assert.equal(bought.body.order.problem, null);
      assert.equal((await ctx.t.admin("POST", `/api/admin/orders/${o.id}/label/buy`, { rateId: "r_ground" })).status, 409, "no second label");
    } finally {
      await ctx.t.close();
    }
  });

  test("a lost answer is 'uncertain' (never retried blindly) and Check label finds the label", async () => {
    const ctx = await setup();
    try {
      const o = await paidLiveOrder(ctx);
      ctx.f.state.buy = "lost";
      ctx.t.store.markPaid(o.id, "stripe");
      await ctx.t.shipping.idle();
      const after = ctx.t.store.getOrder(o.id);
      assert.equal(after.label.state, "uncertain");
      assert.match(after.problem, /Check label/);
      assert.equal((await ctx.t.admin("POST", `/api/admin/orders/${o.id}/label/rates`, {})).status, 409);
      ctx.f.state.labelsForRate = [{ object_id: "tx_found", status: "SUCCESS", label_url: "https://shippo.test/l.pdf", tracking_number: "TRACK1" }];
      const checked = await ctx.t.admin("POST", `/api/admin/orders/${o.id}/label/check`);
      assert.equal(checked.body.order.label.state, "bought");
      assert.equal(checked.body.order.trackingNumber, "TRACK1");
    } finally {
      await ctx.t.close();
    }
  });

  test("Mark shipped records it, sends the shipped email once, and keeps the existing status flow (paid → completed)", async () => {
    const ctx = await setup();
    try {
      const o = await paidLiveOrder(ctx);
      ctx.t.store.markPaid(o.id, "stripe");
      await ctx.t.shipping.idle();
      const r = await ctx.t.admin("POST", `/api/admin/orders/${o.id}/shipped`, {});
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.ok(r.body.order.shippedAt);
      assert.equal(r.body.order.status, "paid");
      assert.equal(ctx.t.sent.filter((s) => s[0] === "shipped").length, 1);
      assert.equal((await ctx.t.admin("POST", `/api/admin/orders/${o.id}/shipped`, {})).status, 409);
      await ctx.t.admin("PATCH", `/api/admin/orders/${o.id}`, { action: "complete" });
      assert.equal(ctx.t.store.getOrder(o.id).status, "completed");
    } finally {
      await ctx.t.close();
    }
  });

  test("an unpaid order has no labels, and a pickup order can't be marked shipped", async () => {
    const ctx = await setup();
    try {
      const it = await ctx.item();
      const o = ctx.t.store.placeOrder({ lines: lines(it), customer: BUYER, fulfillment: "ship", holdMinutes: 30 });
      assert.equal((await ctx.t.admin("POST", `/api/admin/orders/${o.id}/label/rates`, {})).status, 409);
      const it2 = await ctx.item();
      const p = ctx.t.store.placeOrder({ lines: lines(it2), customer: BUYER, fulfillment: "pickup", holdMinutes: 30 });
      ctx.t.store.markPaid(p.id, "cash");
      assert.equal((await ctx.t.admin("POST", `/api/admin/orders/${p.id}/shipped`, {})).status, 409);
      assert.equal(ctx.f.state.buys.length, 0);
    } finally {
      await ctx.t.close();
    }
  });

  test("flag off: a paid ship order buys nothing automatically", async () => {
    const ctx = await setup({ live: false });
    try {
      const it = await ctx.item();
      const o = ctx.t.store.placeOrder({ lines: lines(it), customer: BUYER, fulfillment: "ship", holdMinutes: 30, defaultShippingCents: 1000 });
      ctx.t.store.markPaid(o.id, "stripe");
      await ctx.t.shipping.idle();
      assert.equal(ctx.f.state.buys.length, 0);
      assert.equal(ctx.f.state.shipments.length, 0);
    } finally {
      await ctx.t.close();
    }
  });
});
