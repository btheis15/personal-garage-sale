/**
 * Coupon codes the buyer types at checkout. A code takes money off the items only: never shipping,
 * never more than the items cost. The browser sends just the typed code; the amount is always
 * worked out here from the saved settings.
 *
 * A code: { code, kind: "amount" | "percent", amountCents?, percent?, maxCents?, active }
 */
import { ShopError } from "./store.js";

export const MAX_COUPON_CODES = 50;
const CODE = /^[A-Z0-9_-]{3,30}$/;

const dollars = (c) => (c % 100 === 0 ? `$${c / 100}` : `$${(c / 100).toFixed(2)}`);

/** Checks the list the Sell app saved. Throws a friendly error for the first problem. */
export function parseCouponCodes(input) {
  if (!Array.isArray(input)) throw new ShopError("Coupon codes must be a list.");
  if (input.length > MAX_COUPON_CODES) throw new ShopError(`You can have up to ${MAX_COUPON_CODES} coupon codes.`);
  const seen = new Set();
  return input.map((c, i) => {
    const n = i + 1;
    const code = (typeof c?.code === "string" ? c.code.trim() : "").toUpperCase();
    if (!CODE.test(code)) throw new ShopError(`Coupon ${n}: a code is 3 to 30 letters, numbers, dashes or underscores (like WELCOME10).`);
    if (seen.has(code)) throw new ShopError(`Coupon ${code} is listed twice.`);
    seen.add(code);
    const active = c.active !== false;
    if (c.kind === "amount") {
      const amountCents = Number(c.amountCents);
      if (!Number.isInteger(amountCents) || amountCents < 1 || amountCents > 100_000) throw new ShopError(`Coupon ${code}: the amount off is between $0.01 and $1,000.`);
      return { code, kind: "amount", amountCents, active };
    }
    if (c.kind === "percent") {
      const percent = Number(c.percent);
      if (!Number.isInteger(percent) || percent < 1 || percent > 100) throw new ShopError(`Coupon ${code}: the percent off is a whole number from 1 to 100.`);
      const out = { code, kind: "percent", percent, active };
      if (c.maxCents !== undefined && c.maxCents !== null && c.maxCents !== "") {
        const maxCents = Number(c.maxCents);
        if (!Number.isInteger(maxCents) || maxCents < 1 || maxCents > 100_000) throw new ShopError(`Coupon ${code}: the most it can take off is between $0.01 and $1,000 (or leave it empty).`);
        out.maxCents = maxCents;
      }
      return out;
    }
    throw new ShopError(`Coupon ${code}: choose dollars off or percent off.`);
  });
}

/** A typed code (any case, spaces ignored at the ends) if it's one of the shop's and switched on. */
export function findCoupon(settings, raw) {
  const code = (typeof raw === "string" ? raw.trim() : "").toUpperCase();
  return code ? ((settings.couponCodes ?? []).find((c) => c.active && c.code === code) ?? null) : null;
}

/** What the code takes off the items, in cents: never shipping, never more than the items. */
export function discountFor(coupon, subtotalCents) {
  let off = coupon.kind === "percent" ? Math.round((subtotalCents * coupon.percent) / 100) : coupon.amountCents;
  if (coupon.kind === "percent" && coupon.maxCents) off = Math.min(off, coupon.maxCents);
  return Math.max(0, Math.min(subtotalCents, off));
}

/** "10% off", "$5 off", "20% off, up to $15". */
export function couponLabel(coupon) {
  return coupon.kind === "amount" ? `${dollars(coupon.amountCents)} off` : `${coupon.percent}% off${coupon.maxCents ? `, up to ${dollars(coupon.maxCents)}` : ""}`;
}

/** Is any code switched on? (the website shows its "Have a code?" box only then) */
export const anyActive = (settings) => (settings.couponCodes ?? []).some((c) => c.active);

/** The settings the public site sees: the codes themselves stay private. */
export const publicSettings = ({ couponCodes, ...rest }) => rest;

/** For the website's code box: what a typed code would take off this cart (prices from the database). */
export function checkCoupon(store, { code, lines }) {
  const coupon = findCoupon(store.getSettings(), code);
  if (!coupon) throw new ShopError("That code isn't valid.", { status: 404 });
  let subtotal = 0;
  for (const l of lines) {
    const it = store.getItem(l.id);
    if (it && it.status === "live") subtotal += it.priceCents * Math.max(1, Math.min(99, Math.round(l.qty) || 1));
  }
  return { code: coupon.code, label: couponLabel(coupon), discountCents: discountFor(coupon, subtotal) };
}
