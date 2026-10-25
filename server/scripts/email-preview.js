/**
 * The order emails with a sample order, to look at or to check the email account works.
 *   npm run email-preview                       writes them to data/email-preview/*.html (open in a browser)
 *   npm run email-preview -- --send me@x.com     sends a test email through SMTP_USER / SMTP_PASS
 * Uses the real shop settings from the database when there is one.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "../src/config.js";
import { openDb } from "../src/db.js";
import { buyerPaidEmail, buyerReservedEmail, ownerPaidEmail, ownerReservedEmail, testEmail } from "../src/emails.js";
import { createNotifier } from "../src/notify.js";
import { DEFAULT_SETTINGS } from "../src/site.js";
import { createStore } from "../src/store.js";

const config = loadConfig();
const store = existsSync(config.dbFile) ? createStore(openDb(config.dbFile)) : { getSettings: () => DEFAULT_SETTINGS };
const shop = store.getSettings();
const siteUrl = config.siteUrl || "https://personal-garage-sale.vercel.app";

const sendTo = process.argv.includes("--send") ? process.argv[process.argv.indexOf("--send") + 1] : null;
if (sendTo) {
  const notifier = createNotifier({ config, store });
  try {
    await notifier.test(sendTo);
    console.log(`Sent a test email to ${sendTo} from ${config.smtp.from} (${config.smtp.host}).`);
    process.exit(0);
  } catch (e) {
    console.error(`Couldn't send: ${e.message}`);
    process.exit(1);
  }
}

const now = new Date().toISOString();
const order = {
  id: "00000000-0000-4000-8000-000000000000",
  number: 1012,
  status: "paid",
  method: "stripe",
  channel: "web",
  fulfillment: "pickup",
  items: [
    { title: "Mid-century walnut side table", priceCents: 4500, qty: 1, photo: "/sample/chair.svg" },
    { title: "Kids' bike helmet (youth M)", priceCents: 800, qty: 2, photo: "/sample/bike.svg" },
  ],
  subtotalCents: 6100,
  shippingCents: 0,
  totalCents: 6100,
  customer: { name: "Sam Rivera", email: "sam@example.com", phone: "555-0100", note: "Saturday morning works best." },
  holdUntil: new Date(Date.now() + 48 * 3600_000).toISOString(),
  paidAt: now,
  createdAt: now,
};
const until = new Date(order.holdUntil).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: config.timeZone });
const shipped = { ...order, method: "bch", fulfillment: "ship", shippingCents: 1000, totalCents: 7100, customer: { ...order.customer, address: { line1: "12 Elm St", city: "Springfield", state: "IL", postal_code: "62701" } } };
const emails = {
  "buyer-paid-pickup": buyerPaidEmail({ order, shop, siteUrl }),
  "buyer-paid-ship-bch": buyerPaidEmail({ order: shipped, shop, siteUrl }),
  "buyer-in-person": buyerPaidEmail({ order: { ...order, channel: "in_person", method: "cash" }, shop, siteUrl }),
  "buyer-on-hold": buyerReservedEmail({ order: { ...order, status: "reserved", method: null }, shop, siteUrl, until }),
  "owner-sold": ownerPaidEmail({ order, shop, siteUrl }),
  "owner-on-hold": ownerReservedEmail({ order: { ...order, status: "reserved", method: null }, shop, siteUrl, until }),
  test: testEmail({ shop, siteUrl }),
};
const dir = path.join(config.dataDir, "email-preview");
mkdirSync(dir, { recursive: true });
for (const [name, e] of Object.entries(emails)) {
  writeFileSync(path.join(dir, `${name}.html`), e.html);
  writeFileSync(path.join(dir, `${name}.txt`), `Subject: ${e.subject}\n\n${e.text}`);
}
console.log(`Wrote ${Object.keys(emails).length} emails to ${dir}`);
