"use client";

import "./bch/bch-pay.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { money } from "@/lib/site";
import { ReceiptChoice } from "./bch/ReceiptToken";
import { cart, useCart } from "./cart/store";
import { CheckIcon } from "./icons";
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
  defaultShippingCents: number;
  pickupArea: string;
};
type Method = "stripe" | "bch" | "pickup";

const SAVED = "garage-sale-buyer-v1";

export function CheckoutView({ options, cancelledOrder }: { options: Options; cancelledOrder: string | null }) {
  const router = useRouter();
  const { items, subtotal } = useCart();
  const [customer, setCustomer] = useState({ name: "", email: "", phone: "", note: "" });
  const [fulfillment, setFulfillment] = useState<"pickup" | "ship">("pickup");
  const [method, setMethod] = useState<Method | null>(null);
  const [receipt, setReceipt] = useState<"email" | "token" | "both">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const shippingCents = ship ? Math.max(0, ...items.map((i) => i.shippingEstimate ?? options.defaultShippingCents)) : 0;
  const methods: { value: Method; label: string; hint: string }[] = [
    ...(options.stripe ? [{ value: "stripe" as const, label: "Card, Apple Pay or Google Pay", hint: `Secure checkout through Stripe${options.stripeTest ? " (test mode: use card 4242 4242 4242 4242)" : ""}` }] : []),
    ...(options.bch ? [{ value: "bch" as const, label: "Bitcoin Cash", hint: "Pay from any BCH wallet: scan a QR code or connect your wallet" }] : []),
    ...(options.payAtPickup && !ship
      ? [{ value: "pickup" as const, label: "Pay at pickup", hint: `I'll hold it for ${options.payAtPickupHours} hours. Cash${options.venmo ? ` or Venmo (${options.venmo})` : ""} when you pick it up.` }]
      : []),
  ];
  const chosen = methods.find((m) => m.value === method)?.value ?? (methods.length === 1 ? methods[0].value : null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!chosen) return setError("Pick how you'd like to pay.");
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
        body: JSON.stringify({ lines: items.map((i) => ({ id: i.id, qty: i.qty })), customer, fulfillment: ship ? "ship" : "pickup", method: chosen, ...(chosen === "bch" && options.bchReceipts ? { receipt } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (Array.isArray(data.itemIds) && data.itemIds.length) {
          const gone = items.filter((i) => data.itemIds.includes(i.id)).map((i) => i.title);
          cart.removeMany(data.itemIds);
          router.refresh();
          throw new Error(`${gone.join(", ") || "Something in your cart"} just sold or is on hold, so it's been taken out of your cart.`);
        }
        throw new Error(data.error ?? "Something went wrong. Please try again.");
      }
      if (chosen !== "stripe") cart.clear();
      if (data.url.startsWith("http")) window.location.href = data.url;
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

  const set = (k: keyof typeof customer) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setCustomer((c) => ({ ...c, [k]: e.target.value }));

  return (
    <form onSubmit={submit} className="container-page grid gap-10 py-8 md:grid-cols-[1fr_22rem] md:py-12">
      <div className="space-y-8">
        <h1 className="text-4xl">Checkout</h1>
        {!options.open && <p className="rounded-xl bg-sun p-4 font-bold">This is a preview: checkout opens once the shop is set up.</p>}

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
              <Choice active={ship} onClick={() => setFulfillment("ship")} label="Ship it to me" hint={`US only · ${money(shippingCents || options.defaultShippingCents)}`} />
            </div>
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
              <p className="min-w-0 flex-1 text-sm leading-snug">
                {i.qty > 1 && `${i.qty} × `}
                {i.title}
              </p>
              <p className="font-bold">{money(i.priceCents * i.qty)}</p>
            </li>
          ))}
        </ul>
        <div className="space-y-1 border-t border-line pt-3">
          <p className="flex justify-between">
            <span>Subtotal</span>
            <span>{money(subtotal)}</span>
          </p>
          <p className="flex justify-between">
            <span>{ship ? "Shipping" : "Pickup"}</span>
            <span>{ship ? money(shippingCents) : "Free"}</span>
          </p>
          <p className="flex justify-between pt-2 text-xl font-bold">
            <span>Total</span>
            <span>{money(subtotal + shippingCents)}</span>
          </p>
        </div>
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
