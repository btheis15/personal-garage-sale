"use client";

import Link from "next/link";
import { money } from "@/lib/site";
import type { Item } from "@/lib/types";
import { CopyButton } from "../motion/CopyButton";
import { ItemPhoto } from "../ItemPhoto";
import { QrSvg } from "../QrSvg";
import { Sheet } from "./Sheet";

/**
 * An item's link as a card: a big QR code someone can scan from your phone (at the garage sale,
 * at a Marketplace meetup), plus Share (text it, post it) and Copy. Scanning opens the item in the
 * shop, where they can buy it by card or Bitcoin Cash.
 */
export function ShareSheet({ item, shopName, onClose }: { item: Item; shopName: string; onClose: () => void }) {
  const url = `${window.location.origin}/item/${item.slug}`;
  const short = url.replace(/^https?:\/\//, "");

  const rise = (i: number) => ({ "--i": i }) as React.CSSProperties;
  return (
    <Sheet label={`Share ${item.title}`} onClose={onClose}>
      <div className="animate-card-in rounded-2xl border border-line bg-white p-4 text-center shadow-[0_12px_34px_rgba(31,42,55,0.12)]">
        <div className="flex items-center gap-3 text-left">
          <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-kraft">
            <ItemPhoto url={item.photos[0]?.url} alt="" sizes="56px" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold">{item.title}</p>
            <p className="font-display text-xl font-semibold text-tag">{item.priceCents === 0 ? "Free" : money(item.priceCents)}</p>
          </div>
        </div>
        <div className="qr-reveal mx-auto mt-3 w-fit rounded-lg">
          <QrSvg text={url} size={220} label={`QR code for ${item.title}`} />
        </div>
        <p className="mt-1 text-sm font-semibold">Scan to buy · pay by card or Bitcoin Cash</p>
        <p className="text-xs text-muted">{shopName}</p>
      </div>
      <p className="animate-rise-in mt-3 truncate text-center text-sm text-muted" style={rise(0)}>
        {short}
      </p>
      <div className="animate-rise-in mt-3 grid grid-cols-2 gap-2" style={rise(1)}>
        {typeof navigator !== "undefined" && "share" in navigator ? (
          <button type="button" className="btn btn-primary" onClick={() => navigator.share({ title: item.title, text: `${item.title}, ${money(item.priceCents)}`, url }).catch(() => {})}>
            Share
          </button>
        ) : (
          <a className="btn btn-primary" href={`sms:?&body=${encodeURIComponent(`${item.title}, ${money(item.priceCents)}: ${url}`)}`}>
            Text it
          </a>
        )}
        <CopyButton text={url} />
      </div>
      <div className="animate-rise-in mt-2 grid grid-cols-2 gap-2" style={rise(2)}>
        <Link href={`/sell/charge?item=${item.id}`} className="btn btn-outline text-sm">
          Ring it up now
        </Link>
        <Link href={`/sell/print?items=${item.id}`} className="btn btn-outline text-sm">
          Print a tag
        </Link>
      </div>
    </Sheet>
  );
}
