// "Pay by card" tapped twice on the order page: the first Stripe page is closed before a new one opens,
// so the buyer can never pay twice for one order.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createStripe } from "../src/stripe.js";
import { jpeg, startServer, uploadPhoto } from "./helpers.js";

test("a second card attempt expires the first Stripe page; a paid first page stops it", async () => {
  const calls = { expired: [] };
  const sessions = {};
  let n = 0;
  const client = {
    checkout: {
      sessions: {
        create: async (p) => {
          const s = { id: `cs_test_${++n}`, url: `https://stripe.test/${n}`, payment_status: "unpaid", status: "open", metadata: p.metadata, client_reference_id: p.client_reference_id };
          sessions[s.id] = s;
          return s;
        },
        expire: async (id) => (calls.expired.push(id), sessions[id].payment_status === "paid" ? Promise.reject(new Error("paid")) : Object.assign(sessions[id], { status: "expired" })),
        retrieve: async (id) => sessions[id],
      },
    },
  };
  const t = await startServer({ configOverrides: { stripeSecretKey: "sk_test_abc" }, stripe: (store, { config, notifier }) => createStripe({ config, store, notifier, makeClient: () => client }) });
  try {
    const { body } = await uploadPhoto(t, await jpeg());
    const item = (await t.admin("POST", "/api/admin/items", { title: "Lamp", priceCents: 1500, photos: [body.photo] })).body.item;
    const o = (await t.admin("POST", "/api/admin/charge", { lines: [{ id: item.id, qty: 1 }], method: "link", holdHours: 24 })).body.order;

    assert.equal((await t.site("POST", `/api/orders/${o.id}/pay`, { method: "stripe" })).body.url, "https://stripe.test/1");
    assert.equal((await t.site("POST", `/api/orders/${o.id}/pay`, { method: "stripe" })).body.url, "https://stripe.test/2");
    assert.deepEqual(calls.expired, ["cs_test_1"]);

    // The second page was paid after all: a third tap finds it and refuses.
    Object.assign(sessions.cs_test_2, { payment_status: "paid", payment_intent: "pi_1", customer_details: {} });
    const third = await t.site("POST", `/api/orders/${o.id}/pay`, { method: "stripe" });
    assert.equal(third.status, 409);
    assert.match(third.body.error, /already paid/);
    assert.equal(n, 2);
  } finally {
    await t.close();
  }
});
