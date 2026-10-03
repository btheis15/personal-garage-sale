"use client";

import "../bch/bch-pay.css";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { availability } from "@/lib/availability";
import { money } from "@/lib/site";
import type { Item, Order } from "@/lib/types";
import { QrCode } from "../bch/parts";
import { CheckIcon, MinusIcon, PlusIcon, SearchIcon, TagIcon } from "../icons";
import { sellApi } from "./api";

type Line = { item: Item; qty: number };

/**
 * Selling in person: tap what they're buying, then take cash or Venmo (recorded as paid, and off
 * the website straight away), or show a QR code so they pay on their own phone by card or
 * Bitcoin Cash.
 */
export function RingUp({ items, online, venmo }: { items: Item[]; online: { stripe: boolean; bch: boolean }; venmo: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qrOrder, setQrOrder] = useState<Order | null>(null);
  const [done, setDone] = useState<Order | null>(null);

  const forSale = items.filter((i) => availability(i) === "available");
  const shown = forSale.filter((i) => !q || i.title.toLowerCase().includes(q.toLowerCase()));
  const total = lines.reduce((n, l) => n + l.item.priceCents * l.qty, 0);
  const has = (id: string) => lines.find((l) => l.item.id === id);

  const toggle = (item: Item) => setLines((ls) => (ls.some((l) => l.item.id === item.id) ? ls.filter((l) => l.item.id !== item.id) : [...ls, { item, qty: 1 }]));
  const setQty = (id: string, qty: number) => setLines((ls) => ls.map((l) => (l.item.id === id ? { ...l, qty: Math.max(1, Math.min(Math.max(1, l.item.quantity), qty)) } : l)));

  async function charge(method: "cash" | "venmo" | "other" | "qr") {
    setBusy(method);
    setError(null);
    try {
      const { order } = await sellApi<{ order: Order }>("POST", "/api/sell/charge", { lines: lines.map((l) => ({ id: l.item.id, qty: l.qty })), method });
      if (method === "qr") setQrOrder(order);
      else setDone(order);
      setLines([]);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  }

  // While the buyer pays on their phone: watch the order.
  useEffect(() => {
    if (!qrOrder) return;
    const t = setInterval(async () => {
      const res = await fetch(`/api/orders/${qrOrder.id}`, { cache: "no-store" });
      if (!res.ok) return;
      const o = await res.json();
      if (o.status === "paid" || o.status === "completed") {
        setDone({ ...qrOrder, status: o.status, method: o.method });
        setQrOrder(null);
        router.refresh();
      } else if (o.status === "cancelled" || o.status === "expired") {
        setError("That checkout closed without a payment. The items are back for sale.");
        setQrOrder(null);
        router.refresh();
      }
    }, 2500);
    return () => clearInterval(t);
  }, [qrOrder, router]);

  async function cancelQr() {
    if (!qrOrder) return;
    await sellApi("PATCH", `/api/sell/orders/${qrOrder.id}`, { action: "cancel" }).catch(() => {});
    setQrOrder(null);
    router.refresh();
  }

  if (done)
    return (
      <div className="mx-auto max-w-lg px-4 pt-14 text-center">
        <span className="animate-pop mx-auto grid size-20 place-items-center rounded-full bg-leaf text-white">
          <CheckIcon size={44} strokeWidth={3} />
        </span>
        <h1 className="mt-4 text-4xl">Sold! {money(done.totalCents)}</h1>
        <p className="mt-2 text-muted">{done.items.map((i) => i.title).join(", ")}</p>
        <button type="button" className="btn btn-primary mt-8 w-full" onClick={() => setDone(null)}>
          Next sale
        </button>
      </div>
    );

  if (qrOrder) {
    const url = `${window.location.origin}/order/${qrOrder.id}`;
    return (
      <div className="mx-auto max-w-lg px-4 pt-8 text-center">
        <p className="eyebrow">Order #{qrOrder.number}</p>
        <h1 className="mt-1 text-4xl">{money(qrOrder.totalCents)}</h1>
        <p className="mt-2 text-muted">Have them scan this with their phone&apos;s camera to pay {[online.stripe && "by card, Apple Pay or Google Pay", online.bch && "with Bitcoin Cash"].filter(Boolean).join(" or ")}.</p>
        <div className="bchpay mx-auto mt-6 flex justify-center" style={{ "--bchpay-accent": "#f26a2e", "--bchpay-ink": "#1f2328", "--bchpay-bg": "#ffffff" } as React.CSSProperties}>
          <QrCode text={url} size={260} label="Pay on your phone" logo="/icon.png" listening />
        </div>
        <p className="mt-6 flex items-center justify-center gap-2 font-bold">
          <span className="size-2.5 animate-pulse rounded-full bg-leaf" /> Waiting for their payment…
        </p>
        <button type="button" onClick={cancelQr} className="mt-8 text-sm text-muted underline underline-offset-4">
          Cancel this sale
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 pt-5">
      <h1 className="text-3xl">Ring up a sale</h1>
      <p className="text-sm text-muted">Tap what they&apos;re buying.</p>
      <label className="relative mt-4 block">
        <span className="sr-only">Search</span>
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" size={20} />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="field pl-10" />
      </label>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {shown.map((i) => {
          const on = has(i.id);
          return (
            <button key={i.id} type="button" onClick={() => toggle(i)} className={`relative overflow-hidden rounded-xl border-2 bg-white text-left transition ${on ? "border-tag" : "border-transparent"}`} aria-pressed={Boolean(on)}>
              <div className="relative aspect-square bg-kraft">
                {i.photos[0] ? <Image src={i.photos[0].url} alt="" fill sizes="33vw" className="object-cover" /> : <TagIcon className="absolute inset-0 m-auto text-kraft-dark" />}
                {on && (
                  <span className="absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-tag text-white">
                    <CheckIcon size={14} strokeWidth={3} />
                  </span>
                )}
              </div>
              <p className="truncate px-1.5 pt-1 text-xs">{i.title}</p>
              <p className="px-1.5 pb-1.5 text-sm font-bold">{money(i.priceCents)}</p>
            </button>
          );
        })}
        {!shown.length && <p className="col-span-3 p-6 text-center text-muted">{forSale.length ? "Nothing matches." : "Nothing for sale yet."}</p>}
      </div>

      {lines.length > 0 && (
        <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] mt-5 -mx-4 rounded-t-3xl border-t border-line bg-white px-4 pt-4 pb-4 shadow-[0_-8px_24px_rgba(0,0,0,0.06)]">
          <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
            {lines.map((l) => (
              <li key={l.item.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{l.item.title}</span>
                {l.item.quantity > 1 && (
                  <span className="flex items-center rounded-full border border-line">
                    <button type="button" className="grid size-7 place-items-center" onClick={() => setQty(l.item.id, l.qty - 1)} aria-label="One fewer">
                      <MinusIcon size={14} />
                    </button>
                    <span className="w-5 text-center">{l.qty}</span>
                    <button type="button" className="grid size-7 place-items-center" onClick={() => setQty(l.item.id, l.qty + 1)} aria-label="One more">
                      <PlusIcon size={14} />
                    </button>
                  </span>
                )}
                <span className="w-16 text-right font-bold">{money(l.item.priceCents * l.qty)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 flex justify-between border-t border-line pt-2 text-2xl font-bold">
            <span>Total</span>
            <span>{money(total)}</span>
          </p>
          {error && <p className="mt-2 text-sm font-bold text-berry">{error}</p>}
          <div className="mt-3 grid grid-cols-3 gap-2">
            <button type="button" className="btn btn-primary px-2" disabled={busy !== null} onClick={() => charge("cash")}>
              {busy === "cash" ? "…" : "Cash"}
            </button>
            <button type="button" className="btn btn-outline px-2" disabled={busy !== null} onClick={() => charge("venmo")} title={venmo}>
              {busy === "venmo" ? "…" : "Venmo"}
            </button>
            <button type="button" className="btn btn-outline px-2" disabled={busy !== null} onClick={() => charge("other")}>
              {busy === "other" ? "…" : "Other"}
            </button>
          </div>
          {(online.stripe || online.bch) && (
            <button type="button" className="btn btn-dark mt-2 w-full" disabled={busy !== null} onClick={() => charge("qr")}>
              {busy === "qr" ? "Making the QR code…" : `They pay on their phone (${[online.stripe && "card", online.bch && "BCH"].filter(Boolean).join(" / ")})`}
            </button>
          )}
        </div>
      )}
      {error && !lines.length && <p className="mt-4 rounded-xl bg-berry/10 p-3 text-sm font-bold text-berry">{error}</p>}
    </div>
  );
}
