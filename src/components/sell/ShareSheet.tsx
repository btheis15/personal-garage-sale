"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { money } from "@/lib/site";
import type { Item } from "@/lib/types";
import { CheckIcon, CloseIcon } from "../icons";
import { ItemPhoto } from "../ItemPhoto";
import { QrSvg } from "../QrSvg";

/**
 * An item's link as a card: a big QR code someone can scan from your phone (at the garage sale,
 * at a Marketplace meetup), plus Share (text it, post it) and Copy. Scanning opens the item in the
 * shop, where they can buy it by card or Bitcoin Cash.
 */
export function ShareSheet({ item, shopName, onClose }: { item: Item; shopName: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/item/${item.slug}`;
  const short = url.replace(/^https?:\/\//, "");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      prompt("Copy this link:", url);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={`Share ${item.title}`}>
      <div className="animate-fade-in absolute inset-0 bg-ink/50" onClick={onClose} />
      <div className="animate-sheet-up relative w-full max-w-sm rounded-t-2xl bg-paper p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-2xl">
        <button type="button" onClick={onClose} className="absolute top-3 right-3 grid size-10 place-items-center rounded-full hover:bg-kraft" aria-label="Close">
          <CloseIcon />
        </button>
        <div className="rounded-xl border border-line bg-white p-4 text-center shadow-sm">
          <div className="flex items-center gap-3 text-left">
            <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-kraft">
              <ItemPhoto url={item.photos[0]?.url} alt="" sizes="56px" />
            </div>
            <div className="min-w-0">
              <p className="truncate font-bold">{item.title}</p>
              <p className="text-lg font-bold text-tag">{item.priceCents === 0 ? "Free" : money(item.priceCents)}</p>
            </div>
          </div>
          <QrSvg text={url} size={220} label={`QR code for ${item.title}`} className="mx-auto mt-3" />
          <p className="mt-1 text-sm font-bold">Scan to buy · pay by card or Bitcoin Cash</p>
          <p className="text-xs text-muted">{shopName}</p>
        </div>
        <p className="mt-3 truncate text-center text-sm text-muted">{short}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {typeof navigator !== "undefined" && "share" in navigator ? (
            <button type="button" className="btn btn-primary" onClick={() => navigator.share({ title: item.title, text: `${item.title}, ${money(item.priceCents)}`, url }).catch(() => {})}>
              Share
            </button>
          ) : (
            <a className="btn btn-primary" href={`sms:?&body=${encodeURIComponent(`${item.title}, ${money(item.priceCents)}: ${url}`)}`}>
              Text it
            </a>
          )}
          <button type="button" className="btn btn-outline" onClick={copy}>
            {copied ? (
              <>
                <CheckIcon size={18} /> Copied
              </>
            ) : (
              "Copy link"
            )}
          </button>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Link href={`/sell/charge?item=${item.id}`} className="btn btn-outline text-sm">
            Ring it up now
          </Link>
          <Link href={`/sell/print?items=${item.id}`} className="btn btn-outline text-sm">
            Print a tag
          </Link>
        </div>
      </div>
    </div>
  );
}
