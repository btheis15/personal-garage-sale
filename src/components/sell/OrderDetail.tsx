"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { money, PAY_METHOD_LABEL } from "@/lib/site";
import type { Order } from "@/lib/types";
import { ChevronLeft, TagIcon } from "../icons";
import { sellApi } from "./api";
import { ago, STATUS_LABEL } from "./OrderList";

type BchInfo = { address: string; events: { at: string; kind: string; message: string }[]; problems: { kind: string; message: string }[] };

export function OrderDetail({ order: initial, photos, bch }: { order: Order; photos: Record<string, string | null>; bch: BchInfo | null }) {
  const router = useRouter();
  const [order, setOrder] = useState(initial);
  const [notes, setNotes] = useState(initial.notes);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [label, cls] = STATUS_LABEL[order.status];
  const c = order.customer;
  const a = c.address;

  async function act(action: string, extra: Record<string, unknown> = {}) {
    if (action === "cancel" && !confirm("Cancel this order? The items go back in the shop.")) return;
    setBusy(action + (extra.method ?? ""));
    setError(null);
    try {
      const { order: next } = await sellApi<{ order: Order }>("PATCH", `/api/sell/orders/${order.id}`, { action, ...extra });
      setOrder(next);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  }

  return (
    <div className="mx-auto max-w-lg px-4 pt-4">
      <header className="mb-4 flex items-center gap-2">
        <Link href="/sell/orders" className="-ml-2 grid size-11 place-items-center rounded-lg" aria-label="Back">
          <ChevronLeft />
        </Link>
        <h1 className="flex-1 text-2xl">Order #{order.number}</h1>
        <span className={`rounded-md px-2 py-1 text-sm font-bold ${cls}`}>{label}</span>
      </header>

      {bch?.problems.length ? (
        <div className="mb-4 space-y-1 rounded-2xl bg-berry/10 p-4 text-sm text-berry">
          {bch.problems.map((p, i) => (
            <p key={i} className="font-bold">
              {p.message}
            </p>
          ))}
        </div>
      ) : null}
      {order.notes.includes("Paid after the hold ran out") && <p className="mb-4 rounded-2xl bg-sun/50 p-4 text-sm font-bold">Paid after its hold ran out: check the items weren&apos;t sold to someone else meanwhile.</p>}

      <ul className="divide-y divide-line rounded-2xl border border-line bg-white">
        {order.items.map((i) => (
          <li key={i.id} className="flex items-center gap-3 p-3">
            <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-kraft">
              {photos[i.id] ? <Image src={photos[i.id]!} alt="" fill sizes="56px" className="object-cover" /> : <TagIcon className="absolute inset-0 m-auto text-kraft-dark" />}
            </div>
            <p className="min-w-0 flex-1">
              {i.qty > 1 && `${i.qty} × `}
              {i.title}
            </p>
            <p className="font-bold">{money(i.priceCents * i.qty)}</p>
          </li>
        ))}
        {order.shippingCents > 0 && (
          <li className="flex justify-between p-3">
            <span>Shipping</span>
            <span>{money(order.shippingCents)}</span>
          </li>
        )}
        <li className="flex justify-between p-3 text-xl font-bold">
          <span>Total</span>
          <span>{money(order.totalCents)}</span>
        </li>
      </ul>

      <dl className="mt-4 space-y-2 rounded-2xl border border-line bg-white p-4 text-sm">
        <Row k="Placed" v={`${ago(order.createdAt)} · ${order.channel === "in_person" ? "in person" : "website"}`} />
        <Row k="Payment" v={order.method ? `${PAY_METHOD_LABEL[order.method]}${order.paidAt ? `, paid ${ago(order.paidAt)}` : ""}` : "Not chosen yet"} />
        {order.status === "reserved" && order.holdUntil && <Row k="Held until" v={new Date(order.holdUntil).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} />}
        <Row k="Getting it" v={order.fulfillment === "ship" ? "Ship" : "Pickup"} />
        {c.name && <Row k="Name" v={c.name} />}
        {c.email && <Row k="Email" v={<a href={`mailto:${c.email}?subject=${encodeURIComponent(`Your order #${order.number}`)}`} className="font-bold text-tag-dark underline">{c.email}</a>} />}
        {c.phone && <Row k="Phone" v={<a href={`sms:${c.phone.replace(/[^\d+]/g, "")}`} className="font-bold text-tag-dark underline">{c.phone}</a>} />}
        {a && <Row k="Ship to" v={[a.line1, a.line2, [a.city, a.state, a.postal_code].filter(Boolean).join(" ")].filter(Boolean).join(", ")} />}
        {c.note && <Row k="Their note" v={c.note} />}
        {bch && <Row k="BCH address" v={<span className="break-all">{bch.address}</span>} />}
      </dl>

      {error && <p className="mt-4 rounded-xl bg-berry/10 p-3 text-sm font-bold text-berry">{error}</p>}

      <div className="mt-4 space-y-2">
        {(order.status === "reserved" || order.status === "pending") && (
          <>
            <p className="text-sm font-bold">They paid you in person:</p>
            <div className="grid grid-cols-3 gap-2">
              {(["cash", "venmo", "other"] as const).map((m) => (
                <button key={m} type="button" className="btn btn-primary px-2" disabled={busy !== null} onClick={() => act("paid", { method: m })}>
                  {busy === `paid${m}` ? "…" : PAY_METHOD_LABEL[m]}
                </button>
              ))}
            </div>
          </>
        )}
        {order.status === "paid" && (
          <button type="button" className="btn btn-primary w-full" disabled={busy !== null} onClick={() => act("complete")}>
            {busy === "complete" ? "…" : order.fulfillment === "ship" ? "Shipped" : "Picked up"}
          </button>
        )}
        {(order.status === "reserved" || order.status === "pending") && (
          <button type="button" className="btn btn-outline w-full" disabled={busy !== null} onClick={() => act("cancel")}>
            {busy === "cancel" ? "…" : "Cancel order (items back for sale)"}
          </button>
        )}
        {(order.status === "paid" || order.status === "completed") && order.method === "stripe" && (
          <a href="https://dashboard.stripe.com/payments" target="_blank" rel="noopener noreferrer" className="block py-2 text-center text-sm text-muted underline underline-offset-4">
            Refund in the Stripe dashboard ↗
          </a>
        )}
      </div>

      <label className="mt-6 block">
        <span className="eyebrow">Notes (only you)</span>
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== order.notes && act("note", { notes })} className="field mt-1" />
      </label>

      {bch && bch.events.length > 0 && (
        <details className="mt-6 text-sm">
          <summary className="cursor-pointer font-bold">Bitcoin Cash activity</summary>
          <ul className="mt-2 space-y-1 text-muted">
            {bch.events.map((e, i) => (
              <li key={i}>
                {new Date(e.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}: {e.message}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-24 shrink-0 text-muted">{k}</dt>
      <dd className="min-w-0 flex-1">{v}</dd>
    </div>
  );
}
