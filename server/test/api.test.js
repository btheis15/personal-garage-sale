// The server's routes end to end: tokens, photos, checkout, pay links, the Sell app.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { jpeg, startServer, uploadPhoto } from "./helpers.js";

let t;
before(async () => (t = await startServer()));
after(() => t.close());

async function newItem(o = {}) {
  const { body } = await uploadPhoto(t, await jpeg());
  const r = await t.admin("POST", "/api/admin/items", { title: "Toaster", priceCents: 1200, photos: [body.photo], ...o });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.item;
}

test("tokens: the site token can't use the Sell app's API, and nobody gets in without one", async () => {
  assert.equal((await t.anon("GET", "/api/catalog")).status, 401);
  assert.equal((await t.site("GET", "/api/admin/items")).status, 401);
  assert.equal((await t.admin("GET", "/api/catalog")).status, 401);
  assert.equal((await t.anon("GET", "/health")).status, 200);
});

test("photos are resized to WebP and served at /media", async () => {
  const r = await uploadPhoto(t, await jpeg(1000, 750));
  assert.equal(r.status, 200);
  assert.equal(r.body.photo.maxWidth, 1000);
  for (const w of [320, 480, 640, 828, 1000]) {
    const res = await fetch(`${t.base}/media/${r.body.photo.id}/${w}.webp`);
    assert.equal(res.status, 200, `${w}`);
    assert.equal(res.headers.get("content-type"), "image/webp");
  }
  const bad = await uploadPhoto(t, Buffer.from("not a photo"));
  assert.equal(bad.status, 400);
});

test("posting an item puts it in the catalog", async () => {
  const item = await newItem({ title: "Blue sweater", category: "clothing", size: "L" });
  const { body } = await t.site("GET", "/api/catalog");
  const found = body.items.find((i) => i.id === item.id);
  assert.equal(found.title, "Blue sweater");
  assert.equal(found.size, "L");
  assert.equal(body.payments.stripe, true);
  assert.equal((await t.site("GET", `/api/item/${item.slug}`)).body.item.id, item.id);
});

test("checkout by card holds the item and sends the buyer to Stripe; the second buyer is told it's gone", async () => {
  const item = await newItem();
  const buyer = { name: "Ann", email: "ann@example.com" };
  const r = await t.site("POST", "/api/checkout", { lines: [{ id: item.id, qty: 1 }], customer: buyer, method: "stripe" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.match(r.body.url, /^https:\/\/checkout\.stripe\.test\//);
  const again = await t.site("POST", "/api/checkout", { lines: [{ id: item.id, qty: 1 }], customer: buyer, method: "stripe" });
  assert.equal(again.status, 409);
  assert.deepEqual(again.body.itemIds, [item.id]);
});

test("checkout needs a name and an email", async () => {
  const item = await newItem();
  const r = await t.site("POST", "/api/checkout", { lines: [{ id: item.id, qty: 1 }], customer: { name: "Bo" }, method: "stripe" });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /email/);
});

test("pay at pickup: held, emailed, and paid in the Sell app later", async () => {
  const item = await newItem();
  const r = await t.site("POST", "/api/checkout", { lines: [{ id: item.id, qty: 1 }], customer: { name: "Cy", email: "cy@example.com" }, method: "pickup" });
  const id = r.body.url.split("/").pop();
  const order = (await t.site("GET", `/api/orders/${id}`)).body.order;
  assert.equal(order.status, "reserved");
  assert.ok(t.sent.some(([k, n]) => k === "reserved" && n === order.number));
  const paid = await t.admin("PATCH", `/api/admin/orders/${id}`, { action: "paid", method: "venmo" });
  assert.equal(paid.body.order.status, "paid");
  assert.equal(paid.body.order.method, "venmo");
  const done = await t.admin("PATCH", `/api/admin/orders/${id}`, { action: "complete" });
  assert.equal(done.body.order.status, "completed");
});

test("ring up: cash is paid at once; a pay link waits for the buyer, who can cancel", async () => {
  const a = await newItem();
  const cash = await t.admin("POST", "/api/admin/charge", { lines: [{ id: a.id, qty: 1 }], method: "cash" });
  assert.equal(cash.body.order.status, "paid");
  assert.equal((await t.admin("GET", `/api/admin/items/${a.id}`)).body.item.status, "sold");

  const b = await newItem();
  const link = await t.admin("POST", "/api/admin/charge", { lines: [{ id: b.id, qty: 1 }], method: "link", holdHours: 24 });
  const o = link.body.order;
  assert.equal(o.status, "pending");
  assert.equal(o.method, null);
  const hours = (Date.parse(o.holdUntil) - Date.now()) / 3_600_000;
  assert.ok(hours > 23.9 && hours < 24.1);
  // The buyer opens the link and picks card.
  const pay = await t.site("POST", `/api/orders/${o.id}/pay`, { method: "stripe" });
  assert.match(pay.body.url, /stripe/);
  // …or changes their mind.
  assert.equal((await t.site("POST", `/api/orders/${o.id}/cancel`)).body.status, "cancelled");
  assert.equal((await t.admin("GET", `/api/admin/items/${b.id}`)).body.item.quantity, 1);
});

test("several items at once (all or nothing)", async () => {
  const { body } = await uploadPhoto(t, await jpeg());
  const bad = await t.admin("POST", "/api/admin/items/many", { items: [{ title: "Mug", priceCents: 100, photos: [body.photo] }, { title: "", priceCents: 100 }] });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /^Item 2/);
  const ok = await t.admin("POST", "/api/admin/items/many", { items: [{ title: "Mug", priceCents: 100, photos: [body.photo] }, { title: "Plate", priceCents: 200, status: "draft" }] });
  assert.equal(ok.body.items.length, 2);
});

test("settings save and show in the catalog", async () => {
  const r = await t.admin("PUT", "/api/admin/settings", { name: "The Smiths' Sale", pickupArea: "Elm St, Springfield" });
  assert.equal(r.body.settings.name, "The Smiths' Sale");
  assert.equal((await t.site("GET", "/api/catalog")).body.settings.pickupArea, "Elm St, Springfield");
  assert.equal((await t.admin("PUT", "/api/admin/settings", { name: "" })).status, 400);
});

test("Bitcoin Cash routes say so when it's off", async () => {
  const item = await newItem();
  const r = await t.site("POST", "/api/checkout", { lines: [{ id: item.id, qty: 1 }], customer: { name: "D", email: "d@example.com" }, method: "bch" });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /Bitcoin Cash/);
});
