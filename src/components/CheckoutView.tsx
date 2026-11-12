"use client";

import "./bch/bch-pay.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { money } from "@/lib/site";
import { ReceiptChoice } from "./bch/ReceiptToken";
import { cart, useCart } from "./cart/store";
import { CheckIcon } from "./icons";
import { ExpressPay } from "./ExpressPay";
import { ItemPhoto } from "./ItemPhoto";

type Options = {
  open: boolean;
  stripe: boolean;
  stripeTest: boolean;
  bch: boolean;
  /** Bitcoin Cash buyers can take their receipt as a CashToken. */
  bchReceipts: boolean;
  shopName: string;
  payAtPickup: boolean;
  payAtPickupHours: number;
  venmo: string;
  shipping: boolean;
  /** Live carrier rates: ship orders ask for an address and a quote. Off = the flat shipping below. */
  liveShipping: boolean;
  /** At least one coupon code is active. */
  couponCodes: boolean;
  /** Stripe publishable key when Apple Pay / Google Pay express checkout is on, else "". */
  expressKey: string;
  defaultShippingCents: number;
  pickupArea: string;
};
type Method = "stripe" | "bch" | "pickup";

const SAVED = "garage-sale-buyer-v1";

type Address = { line1: string; line2: string; city: string; state: string; postal_code: string };
const NO_ADDRESS: Address = { line1: "", line2: "", city: "", state: "", postal_code: "" };
/** A live carrier rate from the shop (see /api/shipping-rates). */
type Rate = { id: string; label: string; cents: number; minDays?: number | null; maxDays?: number | null };
type Quote = { id: string; rates: Rate[]; forKey: string };
type Coupon = { code: string; label: string; discountCents: number; forKey: string };
const daysText = (r: Rate) => {
  const a = r.minDays ?? null;
  const b = r.maxDays ?? null;
  if (a === null && b === null) return "";
  return `${a !== null && b !== null && a !== b ? `${a}\u2013${b}` : (b ?? a)} business days`;
};
const rateText = (r: Rate) => `${r.label} \u2014 ${money(r.cents)}${daysText(r) ? ` \u00b7 ${daysText(r)}` : ""}`;

export function CheckoutView({ options, cancelledOrder }: { options: Options; cancelledOrder: string | null }) {
  const router = useRouter();
  const { items, subtotal } = useCart();
  const [customer, setCustomer] = useState({ name: "", email: "", phone: "", note: "" });
  const [fulfillment, setFulfillment] = useState<"pickup" | "ship">("pickup");
  const [method, setMethod] = useState<Method | null>(null);
  const [receipt, setReceipt] = useState<"email" | "token" | "both">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [address, setAddress] = useState<Address>(NO_ADDRESS);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [quote, setQuote] = useState<Quote | null>(null);
  const [rateId, setRateId] = useState<string | undefined>(undefined);
  const [moreRates, setMoreRates] = useState(false);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [couponOpen, setCouponOpen] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [wallet, setWallet] = useState(false);
  const lastAsked = useRef("");

  // Back from Stripe without paying: let the items go again.
  useEffect(() => {
    if (cancelledOrder) fetch(`/api/orders/${encodeURIComponent(cancelledOrder)}/cancel`, { method: "POST" }).catch(() => {});
  }, [cancelledOrder]);

  // The buyer's details, remembered on this device for next time.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVED) ?? "null");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setCustomer((c) => ({ ...c, name: saved.name ?? "", email: saved.email ?? "", phone: saved.phone ?? "" }));
    } catch {
      /* fine */
    }
  }, []);

  const pickupOnly = items.some((i) => !i.ships);
  const shipOnly = items.some((i) => !i.pickup);
  const canShip = options.shipping && !pickupOnly;
  const ship = fulfillment === "ship" && canShip;
  const live = ship && options.liveShipping;
  const lines = items.map((i) => ({ id: i.id, qty: i.qty }));
  const linesKey = JSON.stringify(lines);
  // A quote is only good for the cart and address it was asked for: changing either makes it vanish.
  const quoteKey = JSON.stringify([linesKey, address.line1.trim(), address.line2.trim(), address.city.trim(), address.state.trim(), address.postal_code.trim()]);
  const activeQuote = live && quote && quote.forKey === quoteKey ? quote : null;
  const sorted = activeQuote ? [...activeQuote.rates].sort((a, b) => a.cents - b.cents) : [];
  const chosenRate = sorted.find((r) => r.id === rateId) ?? sorted[0];
  const flatCents = ship ? Math.max(0, ...items.map((i) => i.shippingEstimate ?? options.defaultShippingCents)) : 0;
  const shippingCents = live ? (chosenRate?.cents ?? 0) : flatCents;
  const addressDone = Boolean(address.line1.trim() && address.city.trim() && /^[a-z]{2}$/i.test(address.state.trim()) && /^\d{5}(-?\d{4})?$/.test(address.postal_code.trim()));
  // Coupons take money off the items only, never shipping, and never below $0.
  const activeCoupon = coupon && coupon.forKey === linesKey ? coupon : null;
  const discount = activeCoupon ? Math.min(activeCoupon.discountCents, subtotal) : 0;
  // The Express box (Apple Pay / Google Pay) is showing: the Stripe choice is then just the card form.
  const showExpress = Boolean(options.expressKey) && options.stripe && live;
  const walletsOnPage = showExpress && wallet;
  const methods: { value: Method; label: string; hint: string }[] = [
    ...(options.stripe ? [{ value: "stripe" as const, label: walletsOnPage ? "Credit or debit card" : "Card, Apple Pay or Google Pay", hint: `Secure checkout through Stripe${options.stripeTest ? " (test mode: use card 4242 4242 4242 4242)" : ""}` }] : []),
    ...(options.bch ? [{ value: "bch" as const, label: "Bitcoin Cash", hint: "Pay from your wallet" }] : []),
    ...(options.payAtPickup && !ship
      ? [{ value: "pickup" as const, label: "Pay at pickup", hint: `I'll hold it for ${options.payAtPickupHours} hours. Cash${options.venmo ? ` or Venmo (${options.venmo})` : ""} when you pick it up.` }]
      : []),
  ];
  const chosen = methods.find((m) => m.value === method)?.value ?? (methods.length === 1 ? methods[0].value : null);

  async function askRates() {
    const forKey = quoteKey;
    lastAsked.current = forKey;
    setQuoteBusy(true);
    setQuoteError(null);
    setError(null);
    setFieldErrors({});
    try {
      const res = await fetch("/api/shipping-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines, customer: { name: customer.name, email: customer.email, phone: customer.phone }, address }),
      });
      const data = (await res.json().catch(() => ({}))) as { quoteId?: string; rates?: Rate[]; error?: string; errors?: Record<string, string> };
      if (res.ok && data.quoteId && Array.isArray(data.rates) && data.rates.length) {
        setQuote({ id: data.quoteId, rates: data.rates, forKey });
        setRateId([...data.rates].sort((a, b) => a.cents - b.cents)[0].id);
        setMoreRates(false);
      } else {
        setQuote(null);
        setQuoteError(data.error ?? "Couldn't get shipping options. Please try again.");
        setFieldErrors(data.errors ?? {});
      }
    } catch {
      setQuoteError("Couldn't get shipping options. Check your connection and try again.");
    }
    setQuoteBusy(false);
  }

  // Once the address is complete (and there is a name and email to go with it), look up the options on its own.
  const askRef = useRef(askRates);
  useEffect(() => {
    askRef.current = askRates;
  });
  const readyToAsk = live && addressDone && customer.name.trim() !== "" && customer.email.includes("@");
  useEffect(() => {
    if (!readyToAsk || lastAsked.current === quoteKey) return;
    const t = setTimeout(() => askRef.current(), 700);
    return () => clearTimeout(t);
  }, [readyToAsk, quoteKey]);

  function forgetQuote() {
    setQuote(null);
    lastAsked.current = "";
  }

  // The cart changed under a code: check it again against the new cart (the discount can differ, or it can stop applying).
  const couponRef = useRef(coupon);
  useEffect(() => {
    couponRef.current = coupon;
  });
  useEffect(() => {
    const c = couponRef.current;
    if (!c || c.forKey === linesKey || !items.length) return;
    let stale = false;
    fetch("/api/coupon", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: c.code, lines: JSON.parse(linesKey) }) })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (stale) return;
        if (ok && typeof d.discountCents === "number") setCoupon({ code: d.code ?? c.code, label: d.label ?? c.label, discountCents: d.discountCents, forKey: linesKey });
        else {
          setCoupon(null);
          setCouponError(d.error ?? "That code no longer applies to this cart.");
        }
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linesKey]);

  async function applyCoupon() {
    const code = couponInput.trim();
    if (!code) return;
    setCouponBusy(true);
    setCouponError(null);
    try {
      const res = await fetch("/api/coupon", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, lines }) });
      const data = (await res.json().catch(() => ({}))) as { code?: string; label?: string; discountCents?: number; error?: string };
      if (res.ok && data.code && typeof data.discountCents === "number") {
        setCoupon({ code: data.code, label: data.label ?? "", discountCents: data.discountCents, forKey: linesKey });
        setCouponOpen(false);
        setCouponInput("");
      } else setCouponError(data.error ?? "That code isn't valid.");
    } catch {
      setCouponError("Couldn't check that code. Please try again.");
    }
    setCouponBusy(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!chosen) return setError("Pick how you'd like to pay.");
    if (live && !activeQuote) {
      if (!addressDone) setFieldErrors({ ...(address.line1.trim() ? {} : { line1: "Add your street address." }), ...(address.city.trim() ? {} : { city: "Add your city." }), ...(/^[a-z]{2}$/i.test(address.state.trim()) ? {} : { state: "Use the 2-letter state." }), ...(/^\d{5}(-?\d{4})?$/.test(address.postal_code.trim()) ? {} : { postal_code: "Add your 5-digit ZIP." }) });
      return setError("Add your address and choose a shipping option first.");
    }
    setFieldErrors({});
    setBusy(true);
    setError(null);
    try {
      localStorage.setItem(SAVED, JSON.stringify({ name: customer.name, email: customer.email, phone: customer.phone }));
    } catch {
      /* fine */
    }
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines, customer, fulfillment: ship ? "ship" : "pickup", method: chosen, ...(live && activeQuote && chosenRate ? { address, quoteId: activeQuote.id, rateId: chosenRate.id } : {}), ...(activeCoupon ? { coupon: activeCoupon.code } : {}), ...(walletsOnPage ? { walletsOnPage: true } : {}), ...(chosen === "bch" && options.bchReceipts ? { receipt } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (Array.isArray(data.itemIds) && data.itemIds.length) {
          const gone = items.filter((i) => data.itemIds.includes(i.id)).map((i) => i.title);
          cart.removeMany(data.itemIds);
          router.refresh();
          throw new Error(`${gone.join(", ") || "Something in your cart"} just sold or is on hold, so it's been taken out of your cart.`);
        }
        if (data.errors && typeof data.errors === "object") {
          if (data.errors.coupon) {
            setCoupon(null);
            setCouponError(data.errors.coupon);
            setCouponOpen(true);
          }
          setFieldErrors(data.errors);
          // The options changed under us: ask again, so the buyer sees what's current.
          if (res.status === 409) forgetQuote();
        } else if (res.status === 409 && live) forgetQuote();
        throw new Error(data.error ?? "Something went wrong. Please try again.");
      }
      if (chosen !== "stripe") cart.clear();
      if (data.url.startsWith("http")) window.location.assign(data.url);
      else router.push(data.url);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (!items.length)
    return (
      <div className="container-page max-w-xl py-16 text-center">
        <h1 className="text-4xl">Your cart is empty</h1>
        <p className="mt-3 text-muted">{cancelledOrder ? "No problem: nothing was charged, and the items are back in the shop." : "Find something you like first."}</p>
        <Link href="/shop" className="btn btn-primary mt-6">
          Browse everything
        </Link>
      </div>
    );

  const setAddr = (k: keyof Address) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setAddress((a) => ({ ...a, [k]: e.target.value }));
    setFieldErrors((f) => ({ ...f, [k]: "" }));
    setQuoteError(null);
  };
  const set = (k: keyof typeof customer) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setCustomer((c) => ({ ...c, [k]: e.target.value }));

  return (
    <form onSubmit={submit} className="container-page grid gap-10 py-8 md:grid-cols-[1fr_22rem] md:py-12">
      <div className="space-y-8">
        <h1 className="text-4xl">Checkout</h1>
        {!options.open && <p className="rounded-xl bg-sun p-4 font-bold">This is a preview: checkout opens once the shop is set up.</p>}

        {showExpress && <ExpressPay publishableKey={options.expressKey} lines={lines} openingCents={Math.max(0, subtotal - discount)} coupon={activeCoupon?.code} shopName={options.shopName} onAvailable={setWallet} />}

        <section className="space-y-3">
          <h2 className="text-xl">Your details</h2>
          <input required autoComplete="name" placeholder="Name" value={customer.name} onChange={set("name")} className="field" />
          <input required type="email" autoComplete="email" placeholder="Email (for your receipt and pickup details)" value={customer.email} onChange={set("email")} className="field" />
          <input type="tel" autoComplete="tel" placeholder="Phone (optional, to text about pickup)" value={customer.phone} onChange={set("phone")} className="field" />
        </section>

        {canShip && (
          <section className="space-y-3">
            <h2 className="text-xl">Getting it</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {!shipOnly && (
                <Choice active={!ship} onClick={() => setFulfillment("pickup")} label="Pick it up" hint={`${options.pickupArea} · free`} />
              )}
              <Choice active={ship} onClick={() => setFulfillment("ship")} label="Ship it to me" hint={options.liveShipping ? "US only · price from your address" : `US only · ${money(shippingCents || options.defaultShippingCents)}`} />
            </div>
            {live && (
              <div className="animate-rise space-y-3 rounded-lg border border-line bg-white p-4">
                <p className="font-bold">Where should it go?</p>
                <AddrField label="Street address" error={fieldErrors.line1}>
                  <input required autoComplete="address-line1" value={address.line1} onChange={setAddr("line1")} className="field" aria-invalid={Boolean(fieldErrors.line1)} />
                </AddrField>
                <AddrField label="Apt, suite (optional)">
                  <input autoComplete="address-line2" value={address.line2} onChange={setAddr("line2")} className="field" />
                </AddrField>
                <AddrField label="City" error={fieldErrors.city}>
                  <input required autoComplete="address-level2" value={address.city} onChange={setAddr("city")} className="field" aria-invalid={Boolean(fieldErrors.city)} />
                </AddrField>
                <div className="grid grid-cols-2 gap-3">
                  <AddrField label="State" error={fieldErrors.state}>
                    <input required autoComplete="address-level1" maxLength={2} autoCapitalize="characters" placeholder="CA" value={address.state} onChange={(e) => setAddr("state")({ ...e, target: { ...e.target, value: e.target.value.toUpperCase() } })} className="field" aria-invalid={Boolean(fieldErrors.state)} />
                  </AddrField>
                  <AddrField label="ZIP" error={fieldErrors.postal_code}>
                    <input required inputMode="numeric" autoComplete="postal-code" maxLength={10} value={address.postal_code} onChange={setAddr("postal_code")} className="field" aria-invalid={Boolean(fieldErrors.postal_code)} />
                  </AddrField>
                </div>
                <p className="text-xs text-muted">US addresses only.</p>
                {!activeQuote && (
                  <button type="button" onClick={askRates} disabled={quoteBusy || !addressDone} className="btn btn-outline w-full">
                    {quoteBusy ? "Checking the carriers…" : "Calculate shipping"}
                  </button>
                )}
                {quoteBusy && activeQuote && <p className="text-sm text-muted">Checking the carriers…</p>}
                {quoteError && (
                  <p role="alert" className="rounded-xl bg-berry/10 p-3 text-sm font-bold text-berry">
                    {quoteError}
                  </p>
                )}
                {activeQuote && chosenRate && (
                  <div className="space-y-2" aria-live="polite">
                    <p className="flex items-center gap-2 rounded-lg border-2 border-tag bg-tag-light/40 p-3 font-bold">
                      <CheckIcon size={16} strokeWidth={3} />
                      <span>{rateText(chosenRate)}</span>
                    </p>
                    {sorted.length > 1 && (
                      <>
                        <button type="button" onClick={() => setMoreRates((v) => !v)} aria-expanded={moreRates} aria-controls="more-rates" className="flex min-h-11 items-center text-sm font-bold underline underline-offset-4">
                          More shipping options {moreRates ? "\u25b4" : "\u25be"}
                        </button>
                        {moreRates && (
                          <div id="more-rates" role="radiogroup" aria-label="Shipping options" className="grid gap-2">
                            {sorted.map((r) => (
                              <label key={r.id} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border-2 p-3 text-sm ${r.id === chosenRate.id ? "border-tag bg-tag-light/40" : "border-line"}`}>
                                <input type="radio" name="shipping-rate" checked={r.id === chosenRate.id} onChange={() => setRateId(r.id)} className="size-4 accent-[var(--color-tag)]" />
                                <span>{rateText(r)}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
                {fieldErrors.rate && <p className="text-sm font-bold text-berry">{fieldErrors.rate}</p>}
              </div>
            )}
          </section>
        )}
        {!canShip && <p className="rounded-xl bg-kraft p-4 text-sm">Pickup: {options.pickupArea}. You&apos;ll get the address and we&apos;ll set a time once it&apos;s yours.</p>}

        <section className="space-y-3">
          <h2 className="text-xl">Paying</h2>
          {methods.length ? (
            <div className="grid gap-3">
              {methods.map((m) => (
                <Choice key={m.value} active={chosen === m.value} onClick={() => setMethod(m.value)} label={m.label} hint={m.hint} />
              ))}
              {chosen === "bch" && options.bchReceipts && (
                <div className="animate-rise rounded-lg border border-line bg-white p-4">
                  <p className="font-bold">Your receipt</p>
                  <p className="mb-3 text-sm text-muted">By email, or as a {options.shopName} Receipt: a little token kept in your Bitcoin Cash wallet.</p>
                  <ReceiptChoice value={receipt} onChange={setReceipt} tokenName="Wallet receipt" />
                </div>
              )}
            </div>
          ) : (
            <p className="rounded-xl bg-kraft p-4">Online payment isn&apos;t set up yet. Please get in touch to buy something.</p>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-xl">Anything I should know? (optional)</h2>
          <textarea rows={3} placeholder="e.g. best times to pick up" value={customer.note} onChange={set("note")} className="field" />
        </section>
      </div>

      <aside className="h-fit space-y-4 rounded-lg border border-line bg-white p-5 md:sticky md:top-24">
        <h2 className="text-xl">Your order</h2>
        <ul className="divide-y divide-line">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-3 py-3">
              <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-kraft">
                <ItemPhoto url={i.photo} alt="" sizes="56px" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug">
                  {i.qty > 1 && `${i.qty} × `}
                  {i.title}
                </p>
                <button type="button" onClick={() => cart.remove(i.id)} disabled={busy} className="text-xs text-muted underline underline-offset-4" aria-label={`Remove ${i.title}`}>
                  Remove
                </button>
              </div>
              <p className="font-bold">{money(i.priceCents * i.qty)}</p>
            </li>
          ))}
        </ul>
        <div className="space-y-1 border-t border-line pt-3">
          <p className="flex justify-between">
            <span>Subtotal</span>
            <span>{money(subtotal)}</span>
          </p>
          {activeCoupon && discount > 0 && (
            <p className="flex justify-between text-tag-dark">
              <span className="flex items-center gap-1">
                Code {activeCoupon.code}
                {activeCoupon.label && ` (${activeCoupon.label})`}
                <button type="button" onClick={() => setCoupon(null)} aria-label={`Remove code ${activeCoupon.code}`} className="grid size-11 -my-3 place-items-center text-lg leading-none">
                  &times;
                </button>
              </span>
              <span>&minus;{money(discount)}</span>
            </p>
          )}
          <p className="flex justify-between">
            <span>{ship ? "Shipping" : "Pickup"}</span>
            <span>{!ship ? "Free" : live && !chosenRate ? "Add your address" : money(shippingCents)}</span>
          </p>
          <p className="flex justify-between pt-2 text-xl font-bold">
            <span>Total</span>
            <span>{money(Math.max(0, subtotal - discount) + shippingCents)}</span>
          </p>
        </div>
        {options.couponCodes && !activeCoupon && (
          <div>
            {couponOpen ? (
              <div className="flex gap-2">
                <input aria-label="Coupon code" autoCapitalize="characters" autoComplete="off" placeholder="Code" value={couponInput} onChange={(e) => setCouponInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), applyCoupon())} className="field min-w-0 flex-1 uppercase" />
                <button type="button" onClick={applyCoupon} disabled={couponBusy || !couponInput.trim()} className="btn btn-outline">
                  {couponBusy ? "…" : "Apply"}
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setCouponOpen(true)} aria-expanded={false} className="min-h-11 text-sm underline underline-offset-4">
                Have a code?
              </button>
            )}
            {couponError && <p role="alert" className="mt-1 text-sm font-bold text-berry">{couponError}</p>}
          </div>
        )}
        {error && (
          <p role="alert" className="rounded-xl bg-berry/10 p-3 text-sm font-bold text-berry">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary w-full" disabled={busy || !options.open || !methods.length}>
          {busy ? "One moment…" : chosen === "pickup" ? "Hold it for me" : chosen === "bch" ? "Pay with Bitcoin Cash" : "Continue to payment"}
        </button>
        <p className="text-center text-xs text-muted">Items are held for you while you pay.</p>
      </aside>
    </form>
  );
}

function Choice({ active, onClick, label, hint }: { active: boolean; onClick: () => void; label: string; hint: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`flex items-start gap-3 rounded-lg border-2 bg-white p-4 text-left transition ${active ? "pick border-tag bg-tag-light/40" : "border-line hover:border-kraft-dark"}`}>
      <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 ${active ? "border-tag bg-tag text-white" : "border-kraft-dark"}`}>{active && <CheckIcon size={12} strokeWidth={3} />}</span>
      <span>
        <span className="block font-bold">{label}</span>
        <span className="block text-sm text-muted">{hint}</span>
      </span>
    </button>
  );
}

function AddrField({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-bold">{label}</span>
      {children}
      {error && <span className="mt-1 block text-sm font-bold text-berry">{error}</span>}
    </label>
  );
}
