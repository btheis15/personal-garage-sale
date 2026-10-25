// Notifications on Brian's phone: signing up, what's sent for a hold / an online sale / a cancelled hold,
// and phones that turned notifications off are forgotten.
import assert from "node:assert/strict";
import { test } from "node:test";
import { openDb } from "../src/db.js";
import { createNotifier } from "../src/notify.js";
import { createPush } from "../src/push.js";
import { DEFAULT_SETTINGS } from "../src/site.js";
import { jpeg, startServer, uploadPhoto } from "./helpers.js";

function fakeSender() {
  const sent = [];
  let fail = null;
  return {
    sent,
    failNext: (code) => (fail = code),
    generateVAPIDKeys: () => ({ publicKey: "BPub", privateKey: "priv" }),
    setVapidDetails() {},
    async sendNotification(sub, payload) {
      if (fail) {
        const code = fail;
        fail = null;
        throw Object.assign(new Error("gone"), { statusCode: code });
      }
      sent.push({ to: sub.endpoint, ...JSON.parse(payload) });
    },
  };
}
const sub = (n) => ({ endpoint: `https://push.example/${n}`, keys: { p256dh: "p", auth: "a" } });
const order = { id: "o1", number: 1001, channel: "web", method: "stripe", items: [{ title: "Lamp", qty: 1, priceCents: 2000 }], subtotalCents: 2000, shippingCents: 0, totalCents: 2000, customer: { name: "Sam" }, holdUntil: null };

test("keys are made once and kept; phones sign up, and a gone phone is forgotten", async () => {
  const db = openDb(":memory:");
  const sender = fakeSender();
  const push = createPush({ db, config: { siteUrl: "https://shop.test" }, sender });
  assert.equal(createPush({ db, config: {}, sender: { ...fakeSender(), generateVAPIDKeys: () => assert.fail("made again") } }).publicKey, "BPub");
  assert.throws(() => push.subscribe({ endpoint: "http://not-https" }), /didn't come through/);
  push.subscribe(sub(1), "iPhone");
  push.subscribe(sub(1), "iPhone");
  push.subscribe(sub(2));
  assert.equal(push.count(), 2);
  sender.failNext(410);
  assert.deepEqual(await push.send({ title: "Hi", body: "x" }), { sent: 1 });
  assert.equal(push.count(), 1);
});

test("a hold, an online sale and a cancelled hold buzz the phone; an in-person sale doesn't", async () => {
  const db = openDb(":memory:");
  const sender = fakeSender();
  const push = createPush({ db, config: {}, sender });
  push.subscribe(sub(1));
  const notifier = createNotifier({ config: { siteUrl: "", timeZone: "America/Chicago", notifyEmail: "", smtp: { user: "", pass: "", from: "" } }, store: { getSettings: () => DEFAULT_SETTINGS }, push });
  await notifier.reserved({ ...order, holdUntil: "2026-10-26T23:00:00Z" });
  await notifier.paid(order);
  await notifier.paid({ ...order, channel: "in_person", method: "cash" });
  await notifier.cancelled(order);
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(
    sender.sent.map((s) => s.title),
    ["On hold: Lamp", "Sold! $20.00", "Hold cancelled: Lamp"],
  );
  assert.match(sender.sent[0].body, /Sam is holding it until .*Oct 26/);
  assert.match(sender.sent[1].body, /by card/);
  assert.equal(sender.sent[0].url, "/sell/orders/o1");
});

test("the buyer cancelling their hold tells Brian; giving up on a card payment doesn't", async () => {
  const t = await startServer();
  try {
    const { body } = await uploadPhoto(t, await jpeg());
    const mk = async (title) => (await t.admin("POST", "/api/admin/items", { title, priceCents: 1500, photos: [body.photo] })).body.item;
    const a = await mk("Chair");
    const held = await t.site("POST", "/api/checkout", { lines: [{ id: a.id, qty: 1 }], customer: { name: "Sam", email: "sam@example.com" }, method: "pickup" });
    const id = held.body.url.split("/").pop();
    assert.equal((await t.site("POST", `/api/orders/${id}/cancel`)).body.status, "cancelled");
    const n = t.store.getOrder(id).number;
    assert.deepEqual(t.sent.filter((s) => s[1] === n).map((s) => s[0]), ["reserved", "cancelled"]);
    assert.equal((await t.admin("GET", `/api/admin/items/${a.id}`)).body.item.quantity, 1, "back in the shop");
    // Cancelling again changes nothing and doesn't tell Brian twice.
    await t.site("POST", `/api/orders/${id}/cancel`);
    assert.equal(t.sent.filter((s) => s[1] === n).length, 2);

    const b = await mk("Desk");
    const card = await t.site("POST", "/api/checkout", { lines: [{ id: b.id, qty: 1 }], customer: { name: "Sam", email: "sam@example.com" }, method: "stripe" });
    assert.equal(card.status, 200, JSON.stringify(card.body));
    const cid = t.store.listOrders().find((o) => o.items[0].id === b.id).id;
    await t.site("POST", `/api/orders/${cid}/cancel`);
    assert.equal(t.sent.filter((s) => s[0] === "cancelled").length, 1);
  } finally {
    await t.close();
  }
});
