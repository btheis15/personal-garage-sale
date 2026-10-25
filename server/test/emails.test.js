// The order emails: what's in them, HTML-escaped, and sent from the configured address with both versions.
import assert from "node:assert/strict";
import { test } from "node:test";
import { buyerPaidEmail, buyerReservedEmail, ownerPaidEmail } from "../src/emails.js";
import { createNotifier } from "../src/notify.js";
import { DEFAULT_SETTINGS } from "../src/site.js";

const shop = { ...DEFAULT_SETTINGS, pickupInstructions: "Side door, 5–7pm.", venmo: "@brian" };
const siteUrl = "https://shop.test";
const order = {
  id: "11111111-1111-4111-8111-111111111111",
  number: 1001,
  method: "bch",
  channel: "web",
  fulfillment: "pickup",
  items: [{ title: "Lamp <b>& shade</b>", priceCents: 2000, qty: 1, photo: "/media/x/480.webp" }],
  subtotalCents: 2000,
  shippingCents: 0,
  totalCents: 2000,
  customer: { name: "Sam Rivera", email: "sam@example.com" },
  createdAt: "2026-10-24T12:00:00Z",
};

test("the buyer's receipt: items, total, how they paid, pickup details, their order link", () => {
  const e = buyerPaidEmail({ order, shop, siteUrl });
  assert.match(e.subject, /Order #1001/);
  assert.match(e.html, /It&#39;s yours, Sam!/);
  assert.match(e.html, /Lamp &lt;b&gt;&amp; shade&lt;\/b&gt;/, "titles are escaped");
  assert.doesNotMatch(e.html, /<b>& shade/);
  assert.match(e.html, /https:\/\/shop\.test\/media\/x\/480\.webp/);
  assert.match(e.html, /\$20\.00/);
  assert.match(e.html, /Bitcoin Cash/);
  assert.match(e.html, /Side door, 5–7pm\./);
  assert.match(e.html, /shop\.test\/order\/11111111/);
  assert.match(e.text, /Total  \$20\.00/);
});

test("shipping and in-person receipts say the right thing", () => {
  const ship = buyerPaidEmail({ order: { ...order, fulfillment: "ship", shippingCents: 1000, totalCents: 3000 }, shop, siteUrl });
  assert.match(ship.html, /tracking number/);
  assert.doesNotMatch(ship.html, /Side door/);
  const inPerson = buyerPaidEmail({ order: { ...order, channel: "in_person", method: "cash" }, shop, siteUrl });
  assert.match(inPerson.subject, /receipt/);
  assert.match(inPerson.html, /paid in cash/);
  assert.doesNotMatch(inPerson.html, /Side door|See your order/);
});

test("on hold: until when, and how to pay at pickup", () => {
  const e = buyerReservedEmail({ order: { ...order, method: null }, shop, siteUrl, until: "Sat, Oct 26, 6:00 PM" });
  assert.match(e.html, /until Sat, Oct 26, 6:00 PM/);
  assert.match(e.html, /Venmo \(@brian\)/);
});

test("Brian's Sold! note links to the Sell app", () => {
  const e = ownerPaidEmail({ order, shop, siteUrl });
  assert.match(e.subject, /^Sold: /);
  assert.match(e.html, /shop\.test\/sell\/orders\/11111111/);
  assert.match(e.html, /sam@example\.com/);
});

test("sent from the iCloud address as the shop, HTML and text, to Brian and the buyer", async () => {
  const mails = [];
  const config = { siteUrl, timeZone: "America/Chicago", notifyEmail: "brian@example.com", smtp: { host: "smtp.mail.me.com", port: 587, user: "me@icloud.com", pass: "x", from: "me@icloud.com" } };
  let opts;
  const notifier = createNotifier({ config, store: { getSettings: () => shop }, makeTransport: (o) => ((opts = o), { sendMail: async (m) => mails.push(m) }) });
  assert.equal(opts.requireTLS, true);
  assert.equal(opts.secure, false);
  await notifier.paid(order);
  assert.deepEqual(mails.map((m) => m.to), ["brian@example.com", "sam@example.com"]);
  for (const m of mails) {
    assert.equal(m.from, `"Brian's Garage Sale" <me@icloud.com>`);
    assert.ok(m.html.startsWith("<!doctype html>"));
    assert.ok(m.text.length > 50);
  }
  await notifier.paid({ ...order, number: 1002 }, { skipBuyer: true });
  assert.equal(mails.length, 3);
});
