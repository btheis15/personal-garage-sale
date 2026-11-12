/**
 * Apple Pay / Google Pay on the website's own checkout page ("express"), ported from Om Threads.
 * The wallet's sheet asks for prices as soon as the shopper picks an address (a partial one, no street), and once they
 * approve it the website asks for the order: everything is priced again here, the items are held, and a PaymentIntent is
 * opened for exactly that total. Stripe's notice (or the order page coming back) then marks it paid, as for any card.
 *
 * The browser never sends a price. `expectedTotalCents` is only a check: if the total here differs from what the sheet
 * showed, nothing is held or charged (409 code "total_changed") and the website shows the new total.
 */
import { discountFor, findCoupon } from "./coupons.js";
import { CHECKOUT_HOLD_MINUTES } from "./site.js";
import { readAddress } from "./shipping.js";
import { ShopError } from "./store.js";

const clip = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const usd = (c) => `$${(c / 100).toFixed(2)}`;

export function createExpress({ store, stripe, shipping }) {
  /** Why express can't be used right now (null when it can). */
  function problem() {
    if (!stripe.enabled) return "Card payments aren't set up.";
    if (stripe.publishableProblem) return stripe.publishableProblem;
    if (!shipping?.liveNow()) return "Live shipping prices aren't switched on.";
    return null;
  }
  const ready = () => problem() === null;
  const gate = () => {
    if (!ready()) throw new ShopError("Apple Pay and Google Pay aren't available right now. Please use the regular checkout.", { status: 409 });
  };

  /** The publishable key for the catalog feed, or null. */
  const feed = () => (ready() ? { publishableKey: stripe.publishableKey } : null);

  /** POST /api/express/rates */
  async function rates({ lines, address, coupon }) {
    gate();
    return shipping.expressQuote({ lines, address, coupon });
  }

  /** POST /api/express/order */
  async function order({ lines, quoteId, rateId, coupon, name, email, phone, address, expectedTotalCents }) {
    gate();
    const customer = { name: clip(name, 80), email: clip(email, 120), phone: clip(phone, 40) };
    const errors = {};
    if (!customer.name) errors.name = "Needed.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) errors.email = "Needed.";
    if (!customer.phone) errors.phone = "Needed.";
    if (Object.keys(errors).length) throw new ShopError("Please share your name, email and phone with the wallet.", { status: 400, errors });
    if (!Number.isInteger(expectedTotalCents) || expectedTotalCents <= 0) throw new ShopError("The total the shopper saw is needed.", { status: 400, errors: { expectedTotalCents: "Needed." } });
    let shipTo;
    try {
      shipTo = readAddress(address);
    } catch (e) {
      throw new ShopError(e.message, { status: 422, errors: e.errors });
    }
    // The quote must still fit this cart, mode and ZIP/state.
    const { rate, data } = shipping.expressChoose({ lines, address: shipTo, quoteId, rateId });
    const subtotal = store.priceLines(lines, { ship: true }).reduce((n, i) => n + i.priceCents * i.qty, 0);
    const typed = clip(coupon, 60);
    const code = typed ? findCoupon(store.getSettings(), typed) : null;
    if (typed && !code) throw new ShopError("That code isn't valid.", { status: 409, errors: { coupon: "That code isn't valid." } });
    const priced = { totalCents: subtotal - (code ? discountFor(code, subtotal) : 0) + rate.cents };
    if (priced.totalCents !== expectedTotalCents) {
      throw new ShopError(`The total changed to ${usd(priced.totalCents)}. Please review it and pay again.`, {
        status: 409, errors: { total: "The total changed." }, extra: { code: "total_changed", totalCents: priced.totalCents, shippingCents: rate.cents },
      });
    }
    if (priced.totalCents < 50) throw new ShopError("This order is below the smallest amount we can charge ($0.50).", { status: 409, errors: { coupon: "Too small to charge." } });
    // The label is prepared with the full street (the same service the shopper chose) and bought once the order is paid.
    const prepared = await shipping.prepareExpressLabel({ to: shipTo, customer, parcel: data.parcel, rate });
    const o = store.placeOrder({
      lines, customer, fulfillment: "ship", method: "stripe", holdMinutes: CHECKOUT_HOLD_MINUTES, minTotalCents: 50,
      shippingOverrideCents: rate.cents, shipTo, label: prepared.label, coupon: clip(coupon, 60),
    });
    // Prices can move while the label is prepared (above): the order is only ever charged what the sheet showed.
    if (o.totalCents !== expectedTotalCents) {
      store.releaseOrder(o.id);
      throw new ShopError(`The total changed to ${usd(o.totalCents)}. Please review it and pay again.`, {
        status: 409, errors: { total: "The total changed." }, extra: { code: "total_changed", totalCents: o.totalCents, shippingCents: o.shippingCents },
      });
    }
    store.setOrderFields(o.id, {
      notes: [o.notes, "Apple Pay / Google Pay checkout.", prepared.note].filter(Boolean).join("\n"),
      // No label to buy automatically: shown on the order in the Sell app, like a failed automatic purchase.
      ...(prepared.label ? {} : { problem: prepared.note }),
    });
    try {
      const pi = await stripe.createIntent(o);
      return { clientSecret: pi.client_secret, orderId: o.id, totalCents: o.totalCents, shippingCents: o.shippingCents };
    } catch (e) {
      store.releaseOrder(o.id);
      console.error(`[express] PaymentIntent: ${e.message}`);
      throw new ShopError("Couldn't start the secure payment. Please try again in a moment.", { status: 502 });
    }
  }

  return { problem, ready, feed, rates, order };
}
