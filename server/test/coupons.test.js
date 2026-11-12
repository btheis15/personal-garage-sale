// Coupon codes: what each kind takes off, that it never touches shipping, that the server checks
// the code again at checkout, and what Stripe and Bitcoin Cash are asked to charge.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { deriveHdPath, deriveHdPrivateNodeFromSeed, deriveHdPublicNode, encodeHdPublicKey, hexToBin } from "@bitauth/libauth";
import { createBch } from "../src/bch.js";
import { createBchPrices } from "../src/bch-engine/bch.js";
import { discountFor, findCoupon, parseCouponCodes } from "../src/coupons.js";
import { createStripe } from "../src/stripe.js";
import { createBchChain } from "./bch-chain.js";
import { createFakeBchPrices } from "./bch-fakes.js";
import { jpeg, startServer, uploadPhoto } from "./helpers.js";

const account = deriveHdPath(deriveHdPrivateNodeFromSeed(hexToBin("000102030405060708090a0b0c0d0e0f")), "m/44'/145'/0'");
const XPUB = encodeHdPublicKey({ node: deriveHdPublicNode(account), network: "mainnet" }).hdPublicKey;

const CODES = [
  { code: "FIVE", kind: "amount", amountCents: 500, active: true },
  { code: "TEN", kind: "percent", percent: 10, active: true },
  { code: "CAPPED", kind: "percent", percent: 50, maxCents: 1000, active: true },
  { code: "OFF", kind: "amount", amountCents: 500, active: false },
  { code: "HUGE", kind: "amount", amountCents: 100_000, active: true },
];

let t, chain;
before(async () => {
  chain = createBchChain();
  t = await startServer({
    bch: (store, db) => {
      const notifier = { enabled: true, paid: () => {}, reserved: () => {} };
      return createBch({ config: { bchXpub: XPUB }, db, store, notifier, chain, prices: createBchPrices({ fetchImpl: createFakeBchPrices({ usd: 400 }).fetch }), engineOptions: { proofWaitMs: 0 } });
    },
  });
  const r = await t.admin("PUT", "/api/admin/settings", { couponCodes: CODES, shipping: true });
  assert.equal(r.status, 200, JSON.stringify(r.body));
});
after(() => t.close());

async function newItem(o = {}) {
  const { body } = await uploadPhoto(t, await jpeg());
  const r = await t.admin("POST", "/api/admin/items", { title: "Toaster", priceCents: 4000, photos: [body.photo], ...o });
  return r.body.item;
}
const buyer = { name: "Ann", email: "ann@example.com" };

test("discountFor: dollars off, percent off, percent with a cap, never more than the items", () => {
  assert.equal(discountFor(CODES[0], 4000), 500);
  assert.equal(discountFor(CODES[1], 4000), 400);
  assert.equal(discountFor(CODES[2], 4000), 1000, "50% would be 2000, capped at 1000");
  assert.equal(discountFor(CODES[2], 1000), 500, "under the cap");
  assert.equal(discountFor(CODES[4], 4000), 4000, "can't go below zero");
  assert.equal(discountFor(CODES[0], 300), 300);
});

test("findCoupon: any case, trimmed; unknown and switched-off codes don't work", () => {
  const s = { couponCodes: CODES };
  assert.equal(findCoupon(s, "  ten ").code, "TEN");
  assert.equal(findCoupon(s, "Five").code, "FIVE");
  assert.equal(findCoupon(s, "OFF"), null);
  assert.equal(findCoupon(s, "NOPE"), null);
  assert.equal(findCoupon(s, ""), null);
});

test("saving codes: validated, upper-cased, unique, at most 50", () => {
  assert.equal(parseCouponCodes([{ code: " spring-5 ", kind: "amount", amountCents: 500 }])[0].code, "SPRING-5");
  assert.throws(() => parseCouponCodes([{ code: "A!", kind: "amount", amountCents: 500 }]), /3 to 30/);
  assert.throws(() => parseCouponCodes([{ code: "dup", kind: "amount", amountCents: 500 }, { code: "DUP", kind: "percent", percent: 5 }]), /twice/);
  assert.throws(() => parseCouponCodes([{ code: "BAD", kind: "percent", percent: 0 }]), /percent/);
  assert.throws(() => parseCouponCodes([{ code: "BAD", kind: "percent", percent: 12.5 }]), /percent/);
  assert.throws(() => parseCouponCodes([{ code: "BAD", kind: "amount", amountCents: 0 }]), /amount/);
  assert.throws(() => parseCouponCodes([{ code: "BAD", kind: "percent", percent: 10, maxCents: -1 }]), /most/);
  assert.throws(() => parseCouponCodes([{ code: "BAD", kind: "free" }]), /choose/i);
  assert.throws(() => parseCouponCodes(Array.from({ length: 51 }, (_, i) => ({ code: `CODE${i + 100}`, kind: "amount", amountCents: 100 }))), /up to 50/);
  assert.equal(parseCouponCodes(Array.from({ length: 50 }, (_, i) => ({ code: `CODE${i + 100}`, kind: "amount", amountCents: 100 }))).length, 50);
});

test("the catalog says a code exists but never lists the codes", async () => {
  const { body } = await t.site("GET", "/api/catalog");
  assert.equal(body.payments.couponCodes, true);
  assert.equal(body.settings.couponCodes, undefined);
  assert.ok(!JSON.stringify(body).includes("CAPPED"));
  assert.equal((await t.admin("GET", "/api/admin/settings")).body.settings.couponCodes.length, 5);
});

test("POST /api/coupon: the discount for this cart, or 404", async () => {
  const item = await newItem();
  const lines = [{ id: item.id, qty: 1 }];
  const ok = await t.site("POST", "/api/coupon", { code: "ten", lines });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body, { code: "TEN", label: "10% off", discountCents: 400 });
  assert.equal((await t.site("POST", "/api/coupon", { code: "capped", lines })).body.label, "50% off, up to $10");
  assert.equal((await t.site("POST", "/api/coupon", { code: "capped", lines })).body.discountCents, 1000);
  const bad = await t.site("POST", "/api/coupon", { code: "OFF", lines });
  assert.equal(bad.status, 404);
  assert.equal(bad.body.error, "That code isn't valid.");
  assert.equal((await t.site("POST", "/api/coupon", { code: "NOPE", lines })).status, 404);
  assert.equal((await t.anon("POST", "/api/coupon", { code: "TEN", lines })).status, 401);
});

test("checkout recomputes the discount itself: total = items - discount + shipping, shipping untouched", async () => {
  const item = await newItem({ ships: true, shippingCents: 700 });
  const r = await t.site("POST", "/api/checkout", { lines: [{ id: item.id, qty: 1 }], customer: buyer, method: "pickup", coupon: " five ", discountCents: 99999, totalCents: 1 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const o = (await t.site("GET", `/api/orders/${r.body.url.split("/").pop()}`)).body.order;
  assert.equal(o.subtotalCents, 4000);
  assert.equal(o.discountCents, 500);
  assert.equal(o.coupon, "FIVE");
  assert.equal(o.totalCents, 3500);
});


test("a discount never touches shipping (shipped order)", async () => {
  const item = await newItem({ ships: true, shippingCents: 700 });
  const placed = t.store.placeOrder({ lines: [{ id: item.id, qty: 1 }], fulfillment: "ship", defaultShippingCents: 1000, coupon: "HUGE" });
  assert.equal(placed.discountCents, 4000);
  assert.equal(placed.shippingCents, 700);
  assert.equal(placed.totalCents, 700);
});

test("checkout with an unknown or switched-off code is refused and holds nothing", async () => {
  const item = await newItem();
  for (const coupon of ["NOPE", "OFF"]) {
    const r = await t.site("POST", "/api/checkout", { lines: [{ id: item.id, qty: 1 }], customer: buyer, method: "pickup", coupon });
    assert.equal(r.status, 400);
    assert.equal(r.body.errors.coupon, "That code isn't valid.");
  }
  assert.equal(t.store.getItem(item.id).quantity, 1);
  // Switched off after the shopper saw it work: checkout re-checks.
  await t.admin("PUT", "/api/admin/settings", { couponCodes: CODES.map((c) => (c.code === "TEN" ? { ...c, active: false } : c)) });
  assert.equal((await t.site("POST", "/api/checkout", { lines: [{ id: item.id, qty: 1 }], customer: buyer, method: "pickup", coupon: "TEN" })).status, 400);
  await t.admin("PUT", "/api/admin/settings", { couponCodes: CODES });
});

test("a code that would leave less than 50 cents to charge by card is refused", async () => {
  const item = await newItem();
  const r = await t.site("POST", "/api/checkout", { lines: [{ id: item.id, qty: 1 }], customer: buyer, method: "stripe", coupon: "HUGE" });
  assert.equal(r.status, 409);
  assert.ok(r.body.errors.coupon);
  assert.equal(t.store.getItem(item.id).quantity, 1, "nothing stays held");
});

test("Stripe: a one-off coupon for exactly the discount, and nothing without a code", async () => {
  const calls = { coupons: [], sessions: [] };
  const client = {
    coupons: { create: async (p, o) => (calls.coupons.push([p, o]), { id: "co_1" }) },
    checkout: { sessions: { create: async (p) => (calls.sessions.push(p), { id: "cs_test_1", url: "https://stripe.test/x" }) } },
  };
  const store = t.store;
  const stripe = createStripe({ config: { stripeSecretKey: "sk_test_x", siteUrl: "https://shop.test" }, store, notifier: {}, makeClient: () => client });
  const item = await newItem();
  const withCode = store.placeOrder({ lines: [{ id: item.id, qty: 1 }], coupon: "ten", method: "stripe" });
  await stripe.start(withCode);
  assert.equal(calls.coupons[0][0].amount_off, 400);
  assert.equal(calls.coupons[0][0].currency, "usd");
  assert.equal(calls.coupons[0][0].max_redemptions, 1);
  assert.equal(calls.coupons[0][0].name, "TEN");
  assert.equal(calls.coupons[0][1].idempotencyKey, `coupon-${withCode.id}`);
  assert.deepEqual(calls.sessions[0].discounts, [{ coupon: "co_1" }]);
  assert.equal(calls.sessions[0].line_items[0].price_data.unit_amount, 4000, "line items stay at full price; the coupon takes it off");
  const item2 = await newItem();
  await stripe.start(store.placeOrder({ lines: [{ id: item2.id, qty: 1 }], method: "stripe" }));
  assert.equal(calls.coupons.length, 1);
  assert.equal(calls.sessions[1].discounts, undefined);
});

test("Bitcoin Cash is asked for the discounted total (shipping included, undiscounted)", async () => {
  const item = await newItem({ priceCents: 4000 });
  const r = await t.site("POST", "/api/checkout", { lines: [{ id: item.id, qty: 1 }], customer: buyer, method: "bch", coupon: "TEN" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const id = r.body.url.split("/").pop();
  const view = (await t.site("POST", `/api/orders/${id}/bch/start`)).body;
  assert.equal(view.amountBch, "0.09", "$36 at $400 per BCH");
});

test("pay at pickup totals include the discount, and the buyer view shows the code", async () => {
  const item = await newItem();
  const r = await t.site("POST", "/api/checkout", { lines: [{ id: item.id, qty: 1 }], customer: buyer, method: "pickup", coupon: "TEN" });
  const o = (await t.site("GET", `/api/orders/${r.body.url.split("/").pop()}`)).body.order;
  assert.equal(o.totalCents, 3600);
  assert.equal(o.coupon, "TEN");
  assert.equal(o.discountCents, 400);
});
