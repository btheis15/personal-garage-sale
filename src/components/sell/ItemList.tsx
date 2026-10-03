"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { availability } from "@/lib/availability";
import { money } from "@/lib/site";
import type { Item } from "@/lib/types";
import { SearchIcon, TagIcon } from "../icons";

const FILTERS = [
  { value: "selling", label: "For sale" },
  { value: "draft", label: "Drafts" },
  { value: "sold", label: "Sold" },
  { value: "hidden", label: "Hidden" },
  { value: "all", label: "All" },
] as const;
type Filter = (typeof FILTERS)[number]["value"];

export function ItemList({ items, waitingOrders, soldElsewhereIds }: { items: Item[]; waitingOrders: number; soldElsewhereIds: string[] }) {
  const [filter, setFilter] = useState<Filter>("selling");
  const [q, setQ] = useState("");
  const counts = useMemo(
    () => ({
      selling: items.filter((i) => i.status === "live").length,
      draft: items.filter((i) => i.status === "draft").length,
      sold: items.filter((i) => i.status === "sold").length,
      hidden: items.filter((i) => i.status === "hidden").length,
      all: items.length,
    }),
    [items],
  );
  const shown = items.filter((i) => (filter === "all" ? true : filter === "selling" ? i.status === "live" : i.status === filter)).filter((i) => !q || i.title.toLowerCase().includes(q.toLowerCase()));
  // Sold here but still up somewhere else: a nudge to take it down there.
  const stillListed = items.filter((i) => soldElsewhereIds.includes(i.id));
  const value = items.filter((i) => i.status === "live").reduce((n, i) => n + i.priceCents * Math.max(1, i.quantity), 0);

  return (
    <div className="mx-auto max-w-lg px-4 pt-5">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl">Your items</h1>
          <p className="text-sm text-muted">
            {counts.selling} for sale · {money(value)} listed
          </p>
        </div>
        <Link href="/" className="text-sm font-bold text-tag-dark underline underline-offset-4">
          View shop ↗
        </Link>
      </header>

      {waitingOrders > 0 && (
        <Link href="/sell/orders" className="mt-4 flex items-center justify-between rounded-2xl bg-leaf-light p-4 font-bold text-leaf">
          {waitingOrders} {waitingOrders === 1 ? "order is" : "orders are"} waiting for pickup or shipping
          <span>→</span>
        </Link>
      )}
      {stillListed.map((i) => (
        <Link key={i.id} href={`/sell/items/${i.id}#elsewhere`} className="mt-3 block rounded-2xl bg-sun/40 p-4 text-sm">
          <strong>{i.title}</strong> sold. Remember to mark it sold on {Object.keys(i.channels).map((k) => ({ facebook: "Facebook", ebay: "eBay", craigslist: "Craigslist", offerup: "OfferUp" })[k] ?? k).join(" and ")}.
        </Link>
      ))}

      <label className="relative mt-4 block">
        <span className="sr-only">Search your items</span>
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" size={20} />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="field pl-10" />
      </label>
      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
        {FILTERS.map((f) => (
          <button key={f.value} type="button" onClick={() => setFilter(f.value)} className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-bold ${filter === f.value ? "bg-ink text-paper" : "bg-kraft"}`}>
            {f.label} <span className="opacity-60">{counts[f.value]}</span>
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="mt-10 text-center">
          <TagIcon size={48} className="mx-auto text-kraft-dark" />
          <p className="mt-3 text-lg font-bold">Nothing here yet</p>
          <p className="text-muted">Tap the orange + to sell your first thing.</p>
          <Link href="/sell/new" className="btn btn-primary mt-5">
            Sell something
          </Link>
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-white">
          {shown.map((i) => {
            const state = availability(i);
            return (
              <li key={i.id}>
                <Link href={`/sell/items/${i.id}`} className="flex items-center gap-3 p-3">
                  <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-kraft">
                    {i.photos[0] ? <Image src={i.photos[0].url} alt="" fill sizes="64px" className="object-cover" /> : <TagIcon className="absolute inset-0 m-auto text-kraft-dark" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{i.title}</p>
                    <p className="text-sm text-muted">
                      {money(i.priceCents)}
                      {i.quantity > 1 && ` · ${i.quantity} left`}
                      {i.channels.facebook && " · FB"}
                      {i.channels.ebay && " · eBay"}
                    </p>
                  </div>
                  <Badge status={i.status} state={state} />
                </Link>
              </li>
            );
          })}
          {!shown.length && <li className="p-6 text-center text-muted">Nothing here.</li>}
        </ul>
      )}
    </div>
  );
}

function Badge({ status, state }: { status: Item["status"]; state: ReturnType<typeof availability> }) {
  const [label, cls] =
    status === "draft"
      ? ["Draft", "bg-kraft"]
      : status === "hidden"
        ? ["Hidden", "bg-kraft"]
        : state === "sold"
          ? ["Sold", "bg-ink text-paper"]
          : state === "on_hold"
            ? ["On hold", "bg-sky text-white"]
            : ["Live", "bg-leaf-light text-leaf"];
  return <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-bold ${cls}`}>{label}</span>;
}
