/**
 * The order emails' words and look: the garage sale's own colours (cream paper, flannel navy,
 * late-afternoon amber), a string of bunting across the top, the order number on a price tag,
 * and a yard-sign box with the pickup details. Built from tables with inline styles, so Gmail,
 * Apple Mail and Outlook all show it; every email also has a plain-text version.
 *
 * Each function returns { subject, text, html }. notify.js sends them.
 */
import { moneyText, PAY_METHOD_LABEL } from "./site.js";

// The website's colours (src/app/globals.css).
const C = {
  paper: "#fbf8f1",
  kraft: "#f2ece0",
  kraftDark: "#d8cdb8",
  line: "#e7dfcf",
  ink: "#1f2a37",
  muted: "#66707c",
  navy: "#2c4a6b",
  navyDark: "#1b2f47",
  navyLight: "#e6edf4",
  amber: "#d9952b",
  amberLight: "#f5ddb0",
  sky: "#3a6f9e",
  leaf: "#3f7d56",
  leafLight: "#e3f0e6",
  sun: "#f6e2a6",
};
const SERIF = "Georgia,'Times New Roman',serif";
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const firstName = (o) => (o.customer?.name ? o.customer.name.trim().split(/\s+/)[0] : "");
const itemCount = (o) => o.items.reduce((n, i) => n + i.qty, 0);
const titles = (o) => o.items.map((i) => i.title).join(", ");

/** The pennant flags across the top, in the bunting's colours (as on the website). */
function bunting() {
  const colors = [C.amber, C.paper, C.sky, C.leaf, C.amberLight];
  const flags = Array.from({ length: 13 }, (_, i) => {
    const drop = Math.round(10 * Math.sin((Math.PI * (i + 0.5)) / 13)); // follows the string's sag
    return `<td align="center" valign="top" style="padding-top:${drop}px"><div style="width:0;height:0;border-left:13px solid transparent;border-right:13px solid transparent;border-top:20px solid ${colors[i % colors.length]};font-size:0;line-height:0">&nbsp;</div></td>`;
  }).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>${flags}</tr></table>`;
}

/** The order number on a little price tag, string hole and all. */
const priceTag = (label) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:separate"><tr><td style="background:${C.amberLight};border:1px dashed ${C.amber};border-radius:6px 18px 18px 6px;padding:6px 16px 6px 10px;font-family:${SANS};font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${C.navyDark};white-space:nowrap"><span style="display:inline-block;width:8px;height:8px;border-radius:8px;background:${C.paper};border:1px solid ${C.amber};vertical-align:middle;margin-right:8px"></span>${esc(label)}</td></tr></table>`;

const para = (t, style = "") => ({ text: t, html: `<p style="font-family:${SANS};font-size:15px;line-height:1.6;color:${C.ink};margin:0 0 14px;${style}">${esc(t)}</p>` });

function button(label, url) {
  return {
    text: `${label}: ${url}`,
    html: `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 4px"><tr><td style="background:${C.navy};border-radius:999px"><a href="${esc(url)}" style="display:inline-block;padding:13px 26px;font-family:${SANS};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px">${esc(label)} &rarr;</a></td></tr></table>`,
  };
}

/** What they bought: a photo of each, the price, and the total on an amber tag. */
function itemsBlock(o, siteUrl, { method = null } = {}) {
  const photo = (i) =>
    i.photo && siteUrl
      ? `<img src="${esc(siteUrl + i.photo)}" width="56" height="56" alt="" style="display:block;width:56px;height:56px;object-fit:cover;border-radius:10px;border:1px solid ${C.line};background:${C.kraft}">`
      : `<div style="width:56px;height:56px;border-radius:10px;background:${C.kraft};border:1px solid ${C.line};font-family:${SERIF};font-size:22px;line-height:56px;text-align:center;color:${C.kraftDark}">$</div>`;
  const rows = o.items
    .map(
      (i) => `<tr>
<td width="68" style="padding:10px 12px 10px 0;border-bottom:1px solid ${C.line}">${photo(i)}</td>
<td style="padding:10px 0;border-bottom:1px solid ${C.line};font-family:${SANS};font-size:15px;line-height:1.4;color:${C.ink}">${i.qty > 1 ? `<span style="color:${C.muted}">${i.qty} &times;</span> ` : ""}${esc(i.title)}</td>
<td align="right" style="padding:10px 0 10px 12px;border-bottom:1px solid ${C.line};font-family:${SANS};font-size:15px;font-weight:700;color:${C.ink};white-space:nowrap">${moneyText(i.priceCents * i.qty)}</td>
</tr>`,
    )
    .join("");
  const sum = (k, v) => `<tr><td style="padding:4px 0;font-family:${SANS};font-size:14px;color:${C.muted}">${esc(k)}</td><td align="right" style="padding:4px 0;font-family:${SANS};font-size:14px;color:${C.muted}">${esc(v)}</td></tr>`;
  const getting = o.channel === "in_person" ? null : o.fulfillment === "ship" ? ["Shipping", moneyText(o.shippingCents)] : ["Pickup", "Free"];
  const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-top:1px solid ${C.line}">${rows}</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:10px">
${sum("Subtotal", moneyText(o.subtotalCents))}
${getting ? sum(...getting) : ""}
${method ? sum("Paid with", method) : ""}
<tr><td style="padding:12px 0 0;font-family:${SERIF};font-size:20px;font-weight:700;color:${C.ink}">Total</td>
<td align="right" style="padding:12px 0 0"><span style="display:inline-block;background:${C.amber};color:#ffffff;border-radius:6px 16px 16px 6px;padding:6px 16px;font-family:${SERIF};font-size:20px;font-weight:700">${moneyText(o.totalCents)}</span></td></tr>
</table>`;
  const text = [
    ...o.items.map((i) => `  ${i.qty > 1 ? `${i.qty} × ` : ""}${i.title}  ${moneyText(i.priceCents * i.qty)}`),
    `  Subtotal  ${moneyText(o.subtotalCents)}`,
    ...(getting ? [`  ${getting[0]}  ${getting[1]}`] : []),
    ...(method ? [`  Paid with  ${method}`] : []),
    `  Total  ${moneyText(o.totalCents)}`,
  ].join("\n");
  return { text, html };
}

/** A box like a hand-lettered yard sign: the pickup details, or where it's shipping. */
function signBlock(title, lines) {
  const body = lines.filter(Boolean);
  return {
    text: `${title}:\n${body.join("\n")}`,
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;margin:22px 0 0"><tr><td style="background:${C.kraft};border:2px dashed ${C.kraftDark};border-radius:14px;padding:16px 18px">
<p style="font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:${C.amber};margin:0 0 6px">${esc(title)}</p>
${body.map((l) => `<p style="font-family:${SANS};font-size:15px;line-height:1.55;color:${C.ink};margin:0">${esc(l)}</p>`).join("")}
</td></tr></table>`,
  };
}

/** The buyer's details, for Brian's own copy. */
function buyerBlock(o) {
  const c = o.customer ?? {};
  const a = c.address;
  return signBlock("Buyer", [
    c.name || (o.channel === "in_person" ? "In person" : "No name given"),
    c.email,
    c.phone,
    o.fulfillment === "ship" ? `Ship to: ${a ? [a.line1, a.line2, [a.city, a.state, a.postal_code].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "see Stripe"}` : o.channel === "in_person" ? null : "Picking it up",
    c.note ? `Note: “${c.note}”` : null,
  ]);
}

/**
 * The whole email: cream background, bunting, a navy sign with the shop's name, then a white card
 * with the heading, the blocks, and a little footer.
 */
function layout({ shop, siteUrl, preheader, tag, heading, intro, blocks, footer }) {
  const logo = siteUrl ? `<img src="${esc(siteUrl)}/icon.png" width="52" height="52" alt="" style="display:block;margin:0 auto 10px;width:52px;height:52px;border-radius:52px;border:2px solid ${C.amberLight}">` : "";
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><title>${esc(heading)}</title></head>
<body style="margin:0;padding:0;background:${C.kraft};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:${C.kraft}"><tr><td align="center" style="padding:24px 12px 32px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;border-collapse:collapse">
<tr><td style="border-top:2px solid ${C.navyDark};padding:0 6px">${bunting()}</td></tr>
<tr><td align="center" style="padding:18px 0 0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate"><tr><td align="center" style="background:${C.navy};border-radius:18px 18px 0 0;padding:24px 20px 20px">
  ${logo}
  <p style="font-family:${SERIF};font-size:28px;line-height:1.1;font-weight:700;color:#ffffff;margin:0">${esc(shop.name)}</p>
  <p style="font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:${C.amberLight};margin:8px 0 0">&#9733; Good stuff, good homes &#9733;</p>
  </td></tr></table>
</td></tr>
<tr><td style="background:#ffffff;border-radius:0 0 18px 18px;padding:28px 28px 26px;border:1px solid ${C.line};border-top:0">
${tag ? `${priceTag(tag)}<div style="height:16px;line-height:16px;font-size:0">&nbsp;</div>` : ""}
<h1 style="font-family:${SERIF};font-size:30px;line-height:1.15;font-weight:700;color:${C.ink};margin:0 0 12px;letter-spacing:-.01em">${esc(heading)}</h1>
<p style="font-family:${SANS};font-size:16px;line-height:1.6;color:${C.ink};margin:0 0 22px">${esc(intro)}</p>
${blocks.map((b) => b.html).join("\n")}
</td></tr>
<tr><td align="center" style="padding:22px 16px 0">
<p style="font-family:${SANS};font-size:13px;line-height:1.6;color:${C.muted};margin:0">${esc(footer)}</p>
<p style="font-family:${SERIF};font-size:13px;color:${C.muted};margin:10px 0 0">${esc(shop.name)}${shop.pickupArea && !/sell\s*→/i.test(shop.pickupArea) ? ` &middot; ${esc(shop.pickupArea)}` : ""}${siteUrl ? ` &middot; <a href="${esc(siteUrl)}" style="color:${C.navy};text-decoration:underline">${esc(siteUrl.replace(/^https?:\/\//, ""))}</a>` : ""}</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
  const text = [shop.name.toUpperCase(), "", ...(tag ? [tag, ""] : []), heading, "", intro, "", ...blocks.map((b) => `${b.text}\n`), footer, "", shop.name, ...(siteUrl ? [siteUrl] : [])].join("\n");
  return { text, html };
}

const buyerFooter = (shop) => `Questions about your order? Just reply to this email${shop.contactPhone ? ` or text ${shop.contactPhone}` : ""}.`;
const methodName = (o) => (o.method ? PAY_METHOD_LABEL[o.method] ?? o.method : null);
/** "paid by card", "paid in cash"…, for inside a sentence. */
const PAID_HOW = { stripe: "by card", bch: "with Bitcoin Cash", cash: "in cash", venmo: "with Venmo" };
const paidHow = (o) => (o.method && PAID_HOW[o.method] ? ` ${PAID_HOW[o.method]}` : "");

/** The buyer's receipt, once it's paid (card, Bitcoin Cash, or recorded at pickup / in person). */
export function buyerPaidEmail({ order: o, shop, siteUrl }) {
  const name = firstName(o);
  const method = methodName(o);
  const inPerson = o.channel === "in_person";
  const ship = o.fulfillment === "ship";
  const blocks = [
    itemsBlock(o, siteUrl, { method }),
    ...(inPerson
      ? []
      : ship
        ? [signBlock("Shipping it to you", ["I'll pack it up and ship it in the next couple of days, and email you the tracking number."])]
        : [signBlock("Picking it up", [shop.pickupInstructions])]),
    ...(siteUrl && !inPerson ? [button("See your order", `${siteUrl}/order/${o.id}`)] : []),
    para(`Order #${o.number} · ${new Date(o.paidAt ?? o.createdAt ?? Date.now()).toLocaleDateString("en-US", { dateStyle: "long" })}. This email is your receipt.`, `font-size:13px;color:${C.muted};margin:22px 0 0`),
  ];
  const { text, html } = layout({
    shop,
    siteUrl,
    preheader: inPerson ? `Your receipt from ${shop.name}.` : ship ? "Paid, and it'll be on its way soon." : "Paid! Here's how to pick it up.",
    tag: `Order #${o.number} · Paid`,
    heading: inPerson ? `Thanks for stopping by${name ? `, ${name}` : ""}!` : `It's yours${name ? `, ${name}` : ""}!`,
    intro: inPerson
      ? `Here's your receipt${paidHow(o) ? `, paid${paidHow(o)}` : ""}. Enjoy it!`
      : `Thanks for buying from ${shop.name}. Your payment went through, and ${itemCount(o) > 1 ? "everything is" : "it's"} set aside for you.`,
    blocks,
    footer: buyerFooter(shop),
  });
  return { subject: inPerson ? `Your receipt from ${shop.name}` : `It's yours! Order #${o.number} from ${shop.name}`, text, html };
}

/** Held for the buyer, to pay at pickup. */
export function buyerReservedEmail({ order: o, shop, siteUrl, until }) {
  const name = firstName(o);
  const pay = `cash${shop.venmo ? ` or Venmo (${shop.venmo})` : ""}`;
  const { text, html } = layout({
    shop,
    siteUrl,
    preheader: `On hold for you${until ? ` until ${until}` : ""}. Pay when you pick it up.`,
    tag: `Order #${o.number} · On hold`,
    heading: `It's on hold for you${name ? `, ${name}` : ""}`,
    intro: `Nobody else can buy ${itemCount(o) > 1 ? "these" : "it"}${until ? ` until ${until}` : " for now"}. Pay with ${pay} when you pick ${itemCount(o) > 1 ? "them" : "it"} up.`,
    blocks: [
      itemsBlock(o, siteUrl),
      signBlock("Picking it up", [shop.pickupInstructions]),
      ...(siteUrl ? [button("See your order", `${siteUrl}/order/${o.id}`)] : []),
      para("Changed your mind? No problem: just reply and let me know, and it goes back on sale.", `font-size:13px;color:${C.muted};margin:22px 0 0`),
    ],
    footer: buyerFooter(shop),
  });
  return { subject: `On hold for you: order #${o.number} from ${shop.name}`, text, html };
}

/** Brian's own "Sold!" note. */
export function ownerPaidEmail({ order: o, shop, siteUrl }) {
  const method = methodName(o);
  const { text, html } = layout({
    shop,
    siteUrl,
    preheader: `${moneyText(o.totalCents)}${paidHow(o)}: ${titles(o)}`,
    tag: `Order #${o.number} · Sold`,
    heading: `Sold! ${moneyText(o.totalCents)}`,
    intro: `${o.customer?.name || "Someone"} ${o.channel === "in_person" ? "bought" : "paid for"} ${itemCount(o) > 1 ? `${itemCount(o)} things` : titles(o)}${paidHow(o)}. ${o.fulfillment === "ship" ? "It needs shipping." : o.channel === "in_person" ? "Done and dusted." : "They'll be in touch about pickup."}`,
    blocks: [itemsBlock(o, siteUrl, { method }), buyerBlock(o), ...(siteUrl ? [button("Open it in the Sell app", `${siteUrl}/sell/orders/${o.id}`)] : [])],
    footer: "Sent by your garage sale's Mac mini.",
  });
  return { subject: `Sold: ${titles(o)} (${moneyText(o.totalCents)})`, text, html };
}

/** Brian's note that something's on hold for pickup. */
export function ownerReservedEmail({ order: o, shop, siteUrl, until }) {
  const { text, html } = layout({
    shop,
    siteUrl,
    preheader: `${titles(o)}: held${until ? ` until ${until}` : ""}, paying at pickup.`,
    tag: `Order #${o.number} · On hold`,
    heading: `On hold: ${moneyText(o.totalCents)}`,
    intro: `${o.customer?.name || "Someone"} is holding ${itemCount(o) > 1 ? `${itemCount(o)} things` : titles(o)}${until ? ` until ${until}` : ""}, to pay at pickup. Mark it paid in the Sell app when they do.`,
    blocks: [itemsBlock(o, siteUrl), buyerBlock(o), ...(siteUrl ? [button("Open it in the Sell app", `${siteUrl}/sell/orders/${o.id}`)] : [])],
    footer: "Sent by your garage sale's Mac mini.",
  });
  return { subject: `On hold for pickup: ${titles(o)} (${moneyText(o.totalCents)})`, text, html };
}

/** npm run email-preview -- --send <address>: checks the email account works. */
export function testEmail({ shop, siteUrl }) {
  const { text, html } = layout({
    shop,
    siteUrl,
    preheader: "Order emails are working.",
    tag: "Test",
    heading: "Email is working",
    intro: "This is a test from your garage sale. Order emails to buyers and to you will look like this.",
    blocks: [],
    footer: "Sent by your garage sale's Mac mini.",
  });
  return { subject: `Test email from ${shop.name}`, text, html };
}
