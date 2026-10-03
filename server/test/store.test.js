// Holding items for a checkout, never selling the last one twice, paying, expiring.
import assert from "node:assert/strict";
import { test } from "node:test";
import { openDb } from "../src/db.js";
import { createStore } from "../src/store.js";

const PHOTO = [{ id: "11111111-1111-4111-8111-111111111111", width: 800, height: 600, maxWidth: 800 }];

function setup() {
  let clock = Date.parse("2026-10-03T12:00:00Z");
  const db = openDb(":memory:");
  const store = createStore(db, { now: () => clock });
  const add = (o = {}) => store.createItem({ title: "Lamp", priceCents: 2500, photos: PHOTO, ...o });
  return { db, store, add, tick: (min) => (clock += min * 60_000) };
}

test("placing an order holds the item, with the prices from the database", () => {
  const { store, add } = setup();
  const a = add({ title: "Chair", priceCents: 8500 });
  const b = add({ quantity: 3 });
  const o = store.placeOrder({ lines: [{ id: a.id, qty: 1 }, { id: b.id, qty: 2, priceCents: 1 }], method: "stripe", holdMinutes: 35 });
  assert.equal(o.status, "pending");
  assert.equal(o.totalCents, 8500 + 5000);
  assert.equal(o.number, 1001);
  assert.equal(o.items[0].photo, `/media/${PHOTO[0].id}/480.webp`);
  assert.equal(store.getItem(a.id).quantity, 0);
  assert.ok(store.getItem(a.id).heldUntil);
  assert.equal(store.getItem(b.id).quantity, 1);
  assert.equal(store.getItem(b.id).heldUntil, null);
  assert.equal(store.placeOrder({ lines: [{ id: b.id, qty: 1 }], holdMinutes: 5 }).number, 1002);
});

test("the last one can't be sold twice, and a failed order changes nothing", () => {
  const { store, add } = setup();
  const a = add();
  const b = add();
  store.placeOrder({ lines: [{ id: b.id, qty: 1 }], holdMinutes: 35 });
  assert.throws(() => store.placeOrder({ lines: [{ id: b.id, qty: 1 }], holdMinutes: 35 }), (e) => e.status === 409 && e.itemIds[0] === b.id);
  assert.throws(() => store.placeOrder({ lines: [{ id: a.id, qty: 1 }, { id: b.id, qty: 1 }], holdMinutes: 35 }), /just sold/);
  assert.equal(store.getItem(a.id).quantity, 1, "the first item is back");
  assert.equal(store.listOrders().length, 1);
});

test("shipping: pickup-only items refuse it; one charge per order (the highest)", () => {
  const { store, add } = setup();
  const p = add();
  assert.throws(() => store.placeOrder({ lines: [{ id: p.id, qty: 1 }], fulfillment: "ship", holdMinutes: 35 }), /pickup only/);
  const a = add({ ships: true, shippingCents: 1500 });
  const b = add({ ships: true });
  const o = store.placeOrder({ lines: [{ id: a.id, qty: 1 }, { id: b.id, qty: 1 }], fulfillment: "ship", holdMinutes: 35, defaultShippingCents: 2000 });
  assert.equal(o.shippingCents, 2000);
  assert.equal(o.totalCents, 7000);
});

test("paid once; the item turns sold; more left stays for sale", () => {
  const { store, add } = setup();
  const a = add();
  const o = store.placeOrder({ lines: [{ id: a.id, qty: 1 }], holdMinutes: 35 });
  assert.equal(store.markPaid(o.id, "stripe", "pi_1").status, "paid");
  assert.equal(store.markPaid(o.id, "stripe"), null, "second time: nothing");
  assert.equal(store.getItem(a.id).status, "sold");
  assert.equal(store.getItem(a.id).soldVia, "stripe");
  const b = add({ quantity: 5 });
  store.markPaid(store.placeOrder({ lines: [{ id: b.id, qty: 2 }], holdMinutes: 5 }).id, "cash");
  assert.equal(store.getItem(b.id).status, "live");
  assert.equal(store.getItem(b.id).quantity, 3);
});

test("cancelling gives the items back once; a paid order can't be released", () => {
  const { store, add } = setup();
  const a = add();
  const o = store.placeOrder({ lines: [{ id: a.id, qty: 1 }], holdMinutes: 35 });
  assert.equal(store.releaseOrder(o.id), true);
  assert.equal(store.releaseOrder(o.id), false);
  assert.equal(store.getItem(a.id).quantity, 1);
  const o2 = store.placeOrder({ lines: [{ id: a.id, qty: 1 }], holdMinutes: 35 });
  store.markPaid(o2.id, "bch");
  assert.equal(store.releaseOrder(o2.id), false);
  assert.equal(store.getItem(a.id).status, "sold");
});

test("holds run out: the items go back on sale", () => {
  const { store, add, tick } = setup();
  const a = add();
  const o = store.placeOrder({ lines: [{ id: a.id, qty: 1 }], holdMinutes: 35 });
  tick(36);
  assert.deepEqual(store.expireStale(), [o.id]);
  assert.equal(store.getOrder(o.id).status, "expired");
  assert.equal(store.getItem(a.id).quantity, 1);
  assert.equal(store.getItem(a.id).heldUntil, null);
});

test("a payment after the hold ran out takes the item again and leaves a note", () => {
  const { store, add } = setup();
  const a = add();
  const o = store.placeOrder({ lines: [{ id: a.id, qty: 1 }], method: "bch", holdMinutes: 35 });
  store.releaseOrder(o.id, "expired");
  const paid = store.markPaid(o.id, "bch");
  assert.match(paid.notes, /hold ran out/);
  assert.equal(store.getItem(a.id).status, "sold");
  assert.equal(store.getItem(a.id).quantity, 0);
});

test("items: a live item needs a photo; slugs stay unique; sold and back again", () => {
  const { store, add } = setup();
  assert.throws(() => store.createItem({ title: "No photo", priceCents: 100 }), /photo/);
  const draft = store.createItem({ title: "No photo", priceCents: 100, status: "draft" });
  assert.equal(draft.status, "draft");
  const a = add({ title: "Kids bike" });
  const b = add({ title: "Kids bike" });
  assert.equal(a.slug, "kids-bike");
  assert.equal(b.slug, "kids-bike-2");
  const sold = store.updateItem(a.id, { status: "sold" });
  assert.equal(sold.quantity, 0);
  assert.ok(sold.soldAt);
  const back = store.updateItem(a.id, { status: "live" });
  assert.equal(back.quantity, 1);
  assert.equal(back.soldAt, null);
  const clothes = store.createItem({ title: "Rain jacket", priceCents: 1500, photos: PHOTO, category: "clothing", size: " M ", brand: "Columbia" });
  assert.equal(clothes.size, "M");
  assert.equal(clothes.brand, "Columbia");
  assert.equal(store.createItem({ title: "x", priceCents: 1, photos: PHOTO, category: "nonsense" }).category, "other");
});

test("the catalog: live and recently sold, no private notes", () => {
  const { store, add } = setup();
  add({ title: "For sale", notes: "garage shelf 2" });
  const s = add({ title: "Sold" });
  store.updateItem(s.id, { status: "sold" });
  store.createItem({ title: "Draft", priceCents: 1, status: "draft" });
  const c = store.catalog();
  assert.deepEqual(c.map((i) => i.title).sort(), ["For sale", "Sold"]);
  assert.equal(c[0].notes, undefined);
});
