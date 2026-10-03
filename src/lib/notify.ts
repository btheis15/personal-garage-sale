import "server-only";
import { readSettings } from "./settings";
import { moneyExact, PAY_METHOD_LABEL, siteUrl } from "./site";
import type { Order } from "./types";

/**
 * Order emails through Resend (resend.com, free for 100 a day): a note to you for every order,
 * and a receipt with the pickup details to the buyer. Without RESEND_API_KEY nothing is sent;
 * orders still show in the Sell app.
 */
const key = () => process.env.RESEND_API_KEY ?? "";
const from = () => process.env.NOTIFY_FROM || "Garage Sale <onboarding@resend.dev>";

async function send(to: string, subject: string, text: string, replyTo?: string) {
  if (!key() || !to) return;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: from(), to: [to], subject, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Resend: ${res.status} ${await res.text().catch(() => "")}`);
}

const lines = (o: Order) =>
  [
    ...o.items.map((i) => `  ${i.qty > 1 ? `${i.qty} × ` : ""}${i.title}  ${moneyExact(i.priceCents * i.qty)}`),
    o.shippingCents ? `  Shipping  ${moneyExact(o.shippingCents)}` : null,
    `  Total  ${moneyExact(o.totalCents)}`,
  ]
    .filter(Boolean)
    .join("\n");

const who = (o: Order) => [o.customer.name, o.customer.email, o.customer.phone].filter(Boolean).join(" · ") || "In person";

function ownerTo(settingsEmail: string) {
  return process.env.NOTIFY_EMAIL || settingsEmail;
}

export async function notifyPaid(o: Order) {
  const s = await readSettings();
  const method = o.method ? PAY_METHOD_LABEL[o.method] : "";
  await send(
    ownerTo(s.contactEmail),
    `Sold: ${o.items.map((i) => i.title).join(", ")} (${moneyExact(o.totalCents)})`,
    `Order #${o.number} was paid${method ? ` (${method})` : ""}.\n\n${lines(o)}\n\nBuyer: ${who(o)}\n${o.fulfillment === "ship" ? `Ship to: ${address(o)}\n` : "Pickup\n"}${o.customer.note ? `Note: ${o.customer.note}\n` : ""}\n${siteUrl()}/sell/orders/${o.id}`,
  );
  if (o.customer.email)
    await send(
      o.customer.email,
      `Thanks for your order #${o.number} from ${s.name}`,
      `Hi${o.customer.name ? ` ${o.customer.name.split(" ")[0]}` : ""},\n\nThanks! Your payment${method ? ` (${method})` : ""} went through.\n\n${lines(o)}\n\n${o.fulfillment === "ship" ? "I'll email you the tracking number once it ships." : `Pickup: ${s.pickupInstructions}`}\n\nYour order: ${siteUrl()}/order/${o.id}\n\n${s.name}`,
      s.contactEmail || undefined,
    );
}

export async function notifyReserved(o: Order) {
  const s = await readSettings();
  const until = o.holdUntil ? new Date(o.holdUntil).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: process.env.TZ_DISPLAY || "America/Chicago" }) : "";
  await send(
    ownerTo(s.contactEmail),
    `On hold for pickup: ${o.items.map((i) => i.title).join(", ")} (${moneyExact(o.totalCents)})`,
    `Order #${o.number}: held${until ? ` until ${until}` : ""}, to be paid at pickup.\n\n${lines(o)}\n\nBuyer: ${who(o)}\n${o.customer.note ? `Note: ${o.customer.note}\n` : ""}\n${siteUrl()}/sell/orders/${o.id}`,
  );
  if (o.customer.email)
    await send(
      o.customer.email,
      `On hold for you: order #${o.number} from ${s.name}`,
      `Hi${o.customer.name ? ` ${o.customer.name.split(" ")[0]}` : ""},\n\nIt's on hold for you${until ? ` until ${until}` : ""}. Pay when you pick it up (cash${s.venmo ? ` or Venmo ${s.venmo}` : ""}).\n\n${lines(o)}\n\nPickup: ${s.pickupInstructions}\n\nYour order: ${siteUrl()}/order/${o.id}\n\n${s.name}`,
      s.contactEmail || undefined,
    );
}

function address(o: Order) {
  const a = o.customer.address;
  if (!a) return "(on the Stripe payment)";
  return [a.line1, a.line2, [a.city, a.state, a.postal_code].filter(Boolean).join(" "), a.country].filter(Boolean).join(", ");
}
