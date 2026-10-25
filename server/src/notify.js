/**
 * Order emails, sent by the Mac mini itself through an email account you already have: iCloud Mail
 * by default (SMTP_USER = your @icloud.com address, SMTP_PASS = an app-specific password), or Gmail.
 * You get a "Sold!" note for every order and the buyer gets a receipt with the pickup details. The
 * emails' look is in emails.js. Without SMTP set, nothing is sent; orders still show in the Sell app.
 */
import nodemailer from "nodemailer";
import { buyerPaidEmail, buyerReservedEmail, ownerPaidEmail, ownerReservedEmail, testEmail } from "./emails.js";

export function createNotifier({ config, store, makeTransport = (o) => nodemailer.createTransport(o) }) {
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

  async function paid(o, { skipBuyer = false } = {}) {
    const shop = store.getSettings();
    const ctx = { order: o, shop, siteUrl: config.siteUrl };
    await send(owner(shop), ownerPaidEmail(ctx));
    // In-person cash sales have no email; a buyer who chose only the CashToken receipt has it in their wallet.
    if (o.customer.email && !skipBuyer) await send(o.customer.email, buyerPaidEmail(ctx), replyTo(shop));
  }

  async function reserved(o) {
    const shop = store.getSettings();
    const ctx = { order: o, shop, siteUrl: config.siteUrl, until: o.holdUntil ? when(o.holdUntil) : "" };
    await send(owner(shop), ownerReservedEmail(ctx));
    if (o.customer.email) await send(o.customer.email, buyerReservedEmail(ctx), replyTo(shop));
  }

  /** A test email to `to`; unlike order emails, failures are thrown so the caller sees them. */
  async function test(to) {
    if (!transport) throw new Error("Email isn't set up: add SMTP_USER and SMTP_PASS to .env.");
    await transport.verify();
    await send(to, testEmail({ shop: store.getSettings(), siteUrl: config.siteUrl }));
  }

  const quietly = (fn) => (o, opts) => fn(o, opts).catch((e) => console.error(`[email] order ${o.number}: ${e.message}`));
  return { enabled, paid: quietly(paid), reserved: quietly(reserved), test };
}
