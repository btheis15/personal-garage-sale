/**
 * Order emails, sent by the Mac mini itself through an email account you already have (Gmail with
 * an app password works: SMTP_USER / SMTP_PASS in .env). You get a "Sold!" note for every order and
 * the buyer gets a receipt with the pickup details. Without SMTP set, nothing is sent; orders still
 * show in the Sell app.
 */
import nodemailer from "nodemailer";
import { moneyText, PAY_METHOD_LABEL } from "./site.js";

export function createNotifier({ config, store, makeTransport = (o) => nodemailer.createTransport(o) }) {
  const { smtp } = config;
  const enabled = Boolean(smtp.user && smtp.pass);
  const transport = enabled
    ? makeTransport({ host: smtp.host, port: smtp.port, secure: smtp.port === 465, requireTLS: smtp.port !== 465, auth: { user: smtp.user, pass: smtp.pass }, connectionTimeout: 15_000 })
    : null;

  async function send(to, subject, text, replyTo) {
    if (!transport || !to) return;
    const s = store.getSettings();
    await transport.sendMail({ from: smtp.from.includes("<") ? smtp.from : `"${s.name}" <${smtp.from}>`, to, subject, text, ...(replyTo ? { replyTo } : {}) });
  }

  const lines = (o) =>
    [...o.items.map((i) => `  ${i.qty > 1 ? `${i.qty} × ` : ""}${i.title}  ${moneyText(i.priceCents * i.qty)}`), o.shippingCents ? `  Shipping  ${moneyText(o.shippingCents)}` : null, `  Total  ${moneyText(o.totalCents)}`]
      .filter(Boolean)
      .join("\n");
  const who = (o) => [o.customer.name, o.customer.email, o.customer.phone].filter(Boolean).join(" · ") || "In person";
  const first = (o) => (o.customer.name ? ` ${o.customer.name.split(" ")[0]}` : "");
  const when = (isoText) => new Date(isoText).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: config.timeZone });
  const sellLink = (o) => (config.siteUrl ? `\n${config.siteUrl}/sell/orders/${o.id}` : "");
  const orderLink = (o) => (config.siteUrl ? `\n\nYour order: ${config.siteUrl}/order/${o.id}` : "");
  const address = (o) => {
    const a = o.customer.address;
    return a ? [a.line1, a.line2, [a.city, a.state, a.postal_code].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "(see Stripe)";
  };

  async function paid(o) {
    const s = store.getSettings();
    const method = o.method ? PAY_METHOD_LABEL[o.method] : "";
    await send(
      config.notifyEmail || s.contactEmail,
      `Sold: ${o.items.map((i) => i.title).join(", ")} (${moneyText(o.totalCents)})`,
      `Order #${o.number} was paid${method ? ` (${method})` : ""}.\n\n${lines(o)}\n\nBuyer: ${who(o)}\n${o.fulfillment === "ship" ? `Ship to: ${address(o)}` : "Pickup"}\n${o.customer.note ? `Note: ${o.customer.note}\n` : ""}${sellLink(o)}`,
    );
    // In-person cash sales have no email: nothing to send.
    if (o.customer.email)
      await send(
        o.customer.email,
        `Thanks for your order #${o.number} from ${s.name}`,
        `Hi${first(o)},\n\nThanks! Your payment${method ? ` (${method})` : ""} went through.\n\n${lines(o)}\n\n${o.fulfillment === "ship" ? "I'll ship it in the next couple of days and email you the tracking number." : `Pickup: ${s.pickupInstructions}`}${orderLink(o)}\n\n${s.name}`,
        s.contactEmail || undefined,
      );
  }

  async function reserved(o) {
    const s = store.getSettings();
    const until = o.holdUntil ? when(o.holdUntil) : "";
    await send(
      config.notifyEmail || s.contactEmail,
      `On hold for pickup: ${o.items.map((i) => i.title).join(", ")} (${moneyText(o.totalCents)})`,
      `Order #${o.number}: held${until ? ` until ${until}` : ""}, to be paid at pickup.\n\n${lines(o)}\n\nBuyer: ${who(o)}\n${o.customer.note ? `Note: ${o.customer.note}\n` : ""}${sellLink(o)}`,
    );
    if (o.customer.email)
      await send(
        o.customer.email,
        `On hold for you: order #${o.number} from ${s.name}`,
        `Hi${first(o)},\n\nIt's on hold for you${until ? ` until ${until}` : ""}. Pay when you pick it up (cash${s.venmo ? ` or Venmo ${s.venmo}` : ""}).\n\n${lines(o)}\n\nPickup: ${s.pickupInstructions}${orderLink(o)}\n\n${s.name}`,
        s.contactEmail || undefined,
      );
  }

  const quietly = (fn) => (o) => fn(o).catch((e) => console.error(`[email] order ${o.number}: ${e.message}`));
  return { enabled, paid: quietly(paid), reserved: quietly(reserved) };
}
