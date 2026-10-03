"use client";

import { useState } from "react";
import { money } from "@/lib/site";
import { useOrigin } from "@/lib/use-origin";
import type { Item, Payments, SiteSettings } from "@/lib/types";
import { QrSvg } from "../QrSvg";

/**
 * For the garage sale itself: a sign with the shop's QR code ("scan to pay by card"), and price
 * tags with each item's own QR code. Pick what to print, then Print (or Save as PDF on the phone).
 */
export function PrintView({ items, settings, payments, chosen }: { items: Item[]; settings: SiteSettings; payments: Payments; chosen: string[] | null }) {
  const [mode, setMode] = useState<"tags" | "sign">(chosen ? "tags" : "sign");
  const [picked, setPicked] = useState<Set<string>>(() => new Set(chosen ?? items.map((i) => i.id)));
  const origin = useOrigin();
  const ways = [payments.stripe && "card, Apple Pay, Google Pay", payments.bch && "Bitcoin Cash", "cash", settings.venmo && `Venmo ${settings.venmo}`].filter(Boolean).join(" · ");
  const tags = items.filter((i) => picked.has(i.id));
  const toggle = (id: string) => setPicked((p) => (p.has(id) ? new Set([...p].filter((x) => x !== id)) : new Set([...p, id])));

  return (
    <div className="mx-auto max-w-3xl px-4 pt-5">
      <div className="print:hidden">
        <h1 className="text-3xl">Print QR signs & tags</h1>
        <p className="text-sm text-muted">For the garage sale: people scan with their phone camera to see the item and pay by card right there.</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" className={`btn ${mode === "sign" ? "btn-primary" : "btn-outline"}`} onClick={() => setMode("sign")}>
            Shop sign
          </button>
          <button type="button" className={`btn ${mode === "tags" ? "btn-primary" : "btn-outline"}`} onClick={() => setMode("tags")}>
            Price tags ({picked.size})
          </button>
        </div>
        {mode === "tags" && (
          <details className="mt-3 rounded-lg border border-line bg-white p-3">
            <summary className="cursor-pointer font-bold">Choose items ({picked.size} of {items.length})</summary>
            <div className="mt-2 flex gap-3 text-sm">
              <button type="button" className="underline" onClick={() => setPicked(new Set(items.map((i) => i.id)))}>
                All
              </button>
              <button type="button" className="underline" onClick={() => setPicked(new Set())}>
                None
              </button>
            </div>
            <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto">
              {items.map((i) => (
                <li key={i.id}>
                  <label className="flex items-center gap-2 py-1">
                    <input type="checkbox" checked={picked.has(i.id)} onChange={() => toggle(i.id)} className="size-5 accent-tag" />
                    <span className="flex-1 truncate">{i.title}</span>
                    <span className="font-bold">{money(i.priceCents)}</span>
                  </label>
                </li>
              ))}
            </ul>
          </details>
        )}
        <button type="button" className="btn btn-dark mt-3 w-full" onClick={() => window.print()}>
          Print
        </button>
        <p className="mt-2 mb-6 text-center text-xs text-muted">On iPhone: Print, then pinch out on the preview to save it as a PDF.</p>
      </div>

      {mode === "sign" ? (
        <section className="mx-auto max-w-xl rounded-2xl border-2 border-ink bg-white p-8 text-center print:max-w-none print:border-0">
          <p className="text-5xl font-bold">{settings.name}</p>
          <p className="mt-3 text-2xl">Scan to see everything and pay with your phone</p>
          {origin && <QrSvg text={origin} size={360} label="QR code for the shop" className="mx-auto mt-6 h-auto w-full max-w-[360px]" />}
          <p className="mt-4 text-xl font-bold">{origin.replace(/^https?:\/\//, "")}</p>
          <p className="mt-4 text-lg text-muted">We take {ways}</p>
        </section>
      ) : (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3 print:gap-2">
          {tags.map((i) => (
            <div key={i.id} className="break-inside-avoid rounded-lg border-2 border-dashed border-ink/60 bg-white p-3 text-center">
              <p className="line-clamp-2 text-sm leading-tight font-bold">{i.title}</p>
              <p className="mt-1 text-3xl font-bold">{i.priceCents === 0 ? "FREE" : money(i.priceCents)}</p>
              {i.size && <p className="text-sm">Size {i.size}</p>}
              {origin && <QrSvg text={`${origin}/item/${i.slug}`} size={120} label={`QR code for ${i.title}`} className="mx-auto mt-1" />}
              <p className="text-xs">Scan to pay by card</p>
            </div>
          ))}
          {!tags.length && <p className="col-span-full p-6 text-center text-muted print:hidden">Choose some items above.</p>}
        </section>
      )}
    </div>
  );
}
