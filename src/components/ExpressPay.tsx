"use client";

// "pure": Stripe.js is only fetched when loadStripe is called (so no other page pays for it).
import { loadStripe } from "@stripe/stripe-js/pure";
import type { Stripe, StripeExpressCheckoutElementConfirmEvent } from "@stripe/stripe-js";
import { useEffect, useRef, useState } from "react";

type Line = { id: string; qty: number };
type ExpressRate = { id: string; label: string; cents: number; minDays?: number | null; maxDays?: number | null };
type ExpressQuote = { quoteId: string; rates: ExpressRate[]; subtotalCents: number; discountCents: number };
type Props = {
  publishableKey: string;
  lines: Line[];
  /** Items total after any coupon: only the sheet's opening amount. */
  openingCents: number;
  coupon?: string;
  shopName: string;
  /** Tells the checkout whether a wallet is really available on this device. */
  onAvailable: (v: boolean) => void;
};

// One Stripe.js load per key, and only once a checkout page actually offers the button.
const stripes = new Map<string, Promise<Stripe | null>>();
const stripeFor = (key: string) => {
  let p = stripes.get(key);
  if (!p) stripes.set(key, (p = loadStripe(key)));
  return p;
};

const MIN = 50; // Stripe's smallest charge, in cents

/**
 * Apple Pay and Google Pay: the wallet already knows the buyer's address, so they skip the form.
 * Stripe's Express Checkout Element (deferred intent). Every price comes from the Mac mini: options
 * for the wallet's partial address while the sheet is open, the exact total when it is approved.
 * Renders nothing at all when no wallet is available on this device.
 */
export function ExpressPay({ publishableKey, lines, openingCents, coupon, shopName, onAvailable }: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // The latest props, so a changed cart rebuilds the sheet but typing elsewhere doesn't.
  const latest = useRef({ lines, openingCents, coupon, shopName, onAvailable });
  useEffect(() => {
    latest.current = { lines, openingCents, coupon, shopName, onAvailable };
  });
  // A changed cart or code starts the sheet over (its amount must match what the shop will charge).
  const key = JSON.stringify([lines, coupon, openingCents]);

  useEffect(() => {
    let dead = false;
    let cleanup = () => {};
    (async () => {
      const stripe = await stripeFor(publishableKey);
      if (dead || !stripe || !mount.current) return;
      const { lines: L, openingCents: opening, coupon: code, shopName: biz } = latest.current;
      const elements = stripe.elements({ mode: "payment", currency: "usd", amount: Math.max(MIN, opening), appearance: { variables: { borderRadius: "8px" } } });
      const el = elements.create("expressCheckout", {
        emailRequired: true,
        phoneNumberRequired: true,
        shippingAddressRequired: true,
        allowedShippingCountries: ["US"],
        business: { name: biz },
        // Apple Pay and Google Pay only: Link and the other wallets stay off.
        paymentMethods: { applePay: "auto", googlePay: "auto", link: "never", paypal: "never", klarna: "never", amazonPay: "never" },
        buttonHeight: 48,
      });

      let quote: ExpressQuote | null = null;
      // The option and total the sheet is showing right now: the shop is only ever asked to charge this.
      let shown: { rateId: string; total: number } | null = null;
      const total = (q: ExpressQuote, r: ExpressRate) => Math.max(0, q.subtotalCents - q.discountCents) + r.cents;
      const show = (q: ExpressQuote, r: ExpressRate) => {
        shown = { rateId: r.id, total: total(q, r) };
        elements.update({ amount: Math.max(MIN, shown.total) });
      };
      const lineItems = (q: ExpressQuote, r: ExpressRate) => [
        { name: "Items", amount: q.subtotalCents },
        ...(q.discountCents > 0 ? [{ name: "Discount", amount: -q.discountCents }] : []),
        { name: "Shipping", amount: r.cents },
      ];
      const sheetRate = (r: ExpressRate) => {
        const min = r.minDays && r.minDays > 0 ? { unit: "business_day" as const, value: r.minDays } : undefined;
        const max = r.maxDays && r.maxDays > 0 ? { unit: "business_day" as const, value: r.maxDays } : undefined;
        return { id: r.id, displayName: r.label, amount: r.cents, ...(min || max ? { deliveryEstimate: { ...(min ? { minimum: min } : {}), ...(max ? { maximum: max } : {}) } } : {}) };
      };

      el.on("ready", ({ availablePaymentMethods }) => {
        const ok = Boolean(availablePaymentMethods && (availablePaymentMethods.applePay || availablePaymentMethods.googlePay));
        setReady(ok);
        latest.current.onAvailable(ok);
      });
      el.on("click", ({ resolve }) => {
        setMessage(null);
        quote = null;
        shown = null;
        resolve({
          lineItems: [{ name: "Items", amount: Math.max(0, opening) }],
          // Replaced as soon as the wallet shares where it's going.
          shippingRates: [{ id: "pending", displayName: "Shipping", amount: 0 }],
        });
      });
      el.on("cancel", () => {
        quote = null;
        shown = null;
        elements.update({ amount: Math.max(MIN, opening) });
      });
      el.on("shippingaddresschange", async ({ address, resolve, reject }) => {
        quote = null;
        shown = null;
        try {
          const res = await fetch("/api/express/rates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lines: L, coupon: code, address }) });
          const data = (await res.json().catch(() => ({}))) as Partial<ExpressQuote>;
          if (!res.ok || !data.quoteId || !Array.isArray(data.rates) || !data.rates.length) return reject();
          const q: ExpressQuote = { quoteId: data.quoteId, rates: data.rates, subtotalCents: data.subtotalCents ?? 0, discountCents: data.discountCents ?? 0 };
          quote = q;
          show(q, q.rates[0]);
          resolve({ shippingRates: q.rates.map(sheetRate), lineItems: lineItems(q, q.rates[0]) });
        } catch {
          reject();
        }
      });
      el.on("shippingratechange", ({ shippingRate, resolve, reject }) => {
        const r = quote?.rates.find((x) => x.id === shippingRate.id);
        if (!quote || !r) return reject();
        show(quote, r);
        resolve({ lineItems: lineItems(quote, r) });
      });
      el.on("confirm", async (event: StripeExpressCheckoutElementConfirmEvent) => {
        const fail = (text: string, reason: "fail" | "invalid_shipping_address" = "fail") => {
          setMessage(text);
          event.paymentFailed({ reason, message: text });
        };
        const r = quote?.rates.find((x) => x.id === (event.shippingRate?.id ?? shown?.rateId));
        // Only the total this sheet showed for this option is ever sent.
        if (!quote || !r || !shown || shown.rateId !== r.id) return fail("Something went wrong with your shipping choice. Please try again.");
        const expected = shown.total;
        const { error: submitError } = await elements.submit();
        if (submitError) return fail(submitError.message ?? "Couldn't use that payment method.");
        const ship = event.shippingAddress;
        if (!ship) return fail("We need a shipping address to send this to.", "invalid_shipping_address");
        let order: { clientSecret?: string; orderId?: string; totalCents?: number; error?: string; errors?: Record<string, string> };
        try {
          const res = await fetch("/api/express/order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lines: L,
              coupon: code,
              quoteId: quote.quoteId,
              rateId: r.id,
              name: event.billingDetails?.name ?? ship.name,
              email: event.billingDetails?.email,
              phone: event.billingDetails?.phone,
              address: { line1: ship.address.line1, line2: ship.address.line2 ?? "", city: ship.address.city, state: ship.address.state, postal_code: ship.address.postal_code, country: ship.address.country },
            }),
          });
          order = await res.json().catch(() => ({}));
          // Prices moved: nothing was created or charged.
          if (res.status === 409) {
            quote = null;
            return fail("Prices changed, please try again.");
          }
        } catch {
          return fail("Couldn't reach checkout. Check your connection and try again.");
        }
        if (!order.clientSecret || !order.orderId) return fail(order.error ?? "Couldn't start the payment. Nothing was charged.");
        // Never charge a different amount than the buyer approved.
        if (order.totalCents !== expected) return fail("Prices changed, please try again. Nothing was charged.");
        const { error } = await stripe.confirmPayment({
          elements,
          clientSecret: order.clientSecret,
          confirmParams: { return_url: `${window.location.origin}/order/${encodeURIComponent(order.orderId)}?paid=card` },
        });
        // Only reached when the payment didn't go through (otherwise the browser is sent to return_url).
        if (error) fail(error.message ?? "That payment didn't go through. Nothing was charged.");
      });

      el.mount(mount.current);
      cleanup = () => el.destroy();
    })();
    return () => {
      dead = true;
      cleanup();
      setReady(false);
      latest.current.onAvailable(false);
    };
  }, [publishableKey, key]);

  return (
    // Nothing visible until the wallet says it is available here; the element still has to mount to find out.
    <section aria-label="Apple Pay and Google Pay" className={ready ? "space-y-3" : "h-0 overflow-hidden"}>
      <div className="rounded-lg border border-line bg-white p-4">
        <h2 className="mb-3 text-xl">Express checkout</h2>
        <div ref={mount} />
        {message && (
          <p role="alert" className="mt-3 rounded-xl bg-berry/10 p-3 text-sm font-bold text-berry">
            {message}
          </p>
        )}
      </div>
      <p className="flex items-center gap-3 text-sm text-muted">
        <span className="h-px flex-1 bg-line" />
        Or pay another way
        <span className="h-px flex-1 bg-line" />
      </p>
    </section>
  );
}
