/**
 * Order emails, sent by the Mac mini itself through an email account you already have: iCloud Mail
 * by default (SMTP_USER = your @icloud.com address, SMTP_PASS = an app-specific password), or Gmail.
 * You get a "Sold!" note for every order and the buyer gets a receipt with the pickup details. The
 * emails' look is in emails.js. Without SMTP set, nothing is sent; orders still show in the Sell app.
 * With `push` (push.js), Brian's phone also gets a notification for holds, online sales and cancelled holds.
 */
import nodemailer from "nodemailer";
import { buyerPaidEmail, buyerReservedEmail, ownerCancelledEmail, ownerPaidEmail, ownerReservedEmail, testEmail } from "./emails.js";
import { moneyText } from "./site.js";

export function createNotifier({ config, store, push = null, makeTransport = (o) => nodemailer.createTransport(o) }) {
  const { smtp } = config;
  const enabled = Boolean(smtp.user && smtp.pass);
  const transport = enabled
    ? makeTransport({ host: smtp.host, port: smtp.port, secure: smtp.port === 465, requireTLS: smtp.port !== 465, auth: { user: smtp.user, pass: smtp.pass }, connectionTimeout: 15_000 })
    : null;

  async function send(to, { subject, text, html }, replyTo) {
    if (!transport || !to) return;
    const s = store.getSettings();
    await transport.sendMail({ from: smtp.from.includes("<") ? smtp.from : `"${s.name.replace(/"/g, "")}" <${smtp.from}>`, to, subject, text, html, ...(replyTo ? { replyTo } : {}) });
  }

  const when = (isoText) => new Date(isoText).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: config.timeZone });
  const owner = (s) => config.notifyEmail || s.contactEmail;
  // Replies go to the From address anyway; a different contact email in Settings takes them instead.
  const replyTo = (s) => (s.contactEmail && s.contactEmail !== smtp.from ? s.contactEmail : undefined);

  const what = (o) => (o.items.length === 1 ? o.items[0].title : `${o.items.reduce((n, i) => n + i.qty, 0)} things`);
  const who = (o) => o.customer?.name?.trim() || "Someone";
  const notify = (o, title, body) => push?.send({ title, body, url: `/sell/orders/${o.id}`, tag: `order-${o.id}` }).catch((e) => console.error(`[push] order ${o.number}: ${e.message}`));
  const PAID_HOW = { stripe: " by card", bch: " with Bitcoin Cash" };

  async function paid(o, { skipBuyer = false } = {}) {
    const shop = store.getSettings();
    const ctx = { order: o, shop, siteUrl: config.siteUrl };
    // Sales rung up in person, Brian did himself: no buzz for those.
    if (o.channel !== "in_person") notify(o, `Sold! ${moneyText(o.totalCents)}`, `${who(o)} paid for ${what(o)}${PAID_HOW[o.method] ?? ""}.`);
    await send(owner(shop), ownerPaidEmail(ctx));
    // In-person cash sales have no email; a buyer who chose only the CashToken receipt has it in their wallet.
    if (o.customer.email && !skipBuyer) await send(o.customer.email, buyerPaidEmail(ctx), replyTo(shop));
  }

  async function reserved(o) {
    const shop = store.getSettings();
    const ctx = { order: o, shop, siteUrl: config.siteUrl, until: o.holdUntil ? when(o.holdUntil) : "" };
    notify(o, `On hold: ${what(o)}`, `${who(o)} is holding it${ctx.until ? ` until ${ctx.until}` : ""}, to pay ${moneyText(o.totalCents)} at pickup.`);
    await send(owner(shop), ownerReservedEmail(ctx));
    if (o.customer.email) await send(o.customer.email, buyerReservedEmail(ctx), replyTo(shop));
  }

  /** The buyer cancelled their hold. */
  async function cancelled(o) {
    const shop = store.getSettings();
    notify(o, `Hold cancelled: ${what(o)}`, `${who(o)} cancelled. ${o.items.length > 1 ? "They're" : "It's"} back in the shop.`);
    await send(owner(shop), ownerCancelledEmail({ order: o, shop, siteUrl: config.siteUrl }));
  }

  /** A test email to `to`; unlike order emails, failures are thrown so the caller sees them. */
  async function test(to) {
    if (!transport) throw new Error("Email isn't set up: add SMTP_USER and SMTP_PASS to .env.");
    await transport.verify();
    await send(to, testEmail({ shop: store.getSettings(), siteUrl: config.siteUrl }));
  }

  const quietly = (fn) => (o, opts) => fn(o, opts).catch((e) => console.error(`[email] order ${o.number}: ${e.message}`));
  return { enabled, paid: quietly(paid), reserved: quietly(reserved), cancelled: quietly(cancelled), test };
}
