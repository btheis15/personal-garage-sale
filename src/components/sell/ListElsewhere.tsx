"use client";

import { useState } from "react";
import { conditionLabel, money } from "@/lib/site";
import type { Channels, Item } from "@/lib/types";
import { sellApi } from "./api";

const PLACES = [
  {
    key: "facebook" as const,
    name: "Facebook Marketplace",
    create: "https://www.facebook.com/marketplace/create/item",
    hint: "Copy the text and save the photos, then make the listing in the Facebook app and paste its link here.",
  },
  {
    key: "ebay" as const,
    name: "eBay",
    create: "https://www.ebay.com/sl/prelist/suggest",
    hint: "Same idea for eBay. (Posting to eBay straight from here is planned: see docs/MARKETPLACES.md.)",
  },
  {
    key: "craigslist" as const,
    name: "Craigslist",
    create: "https://post.craigslist.org/",
    hint: "",
  },
];

/** The listing as text for another site: title, price, condition, description and a link to buy it here. */
export function listingText(item: Item, origin: string) {
  return [
    item.title,
    `${item.priceCents === 0 ? "Free" : money(item.priceCents)}${item.obo ? " or best offer" : ""}`,
    `Condition: ${conditionLabel(item.condition)}`,
    "",
    item.description,
    "",
    item.pickup ? "Local pickup." : "",
    `Pay online and it's yours: ${origin}/item/${item.slug}`,
  ]
    .filter((l, i, a) => l !== "" || (a[i - 1] !== "" && i > 0))
    .join("\n")
    .trim();
}

/**
 * Posting the item somewhere else too. Facebook doesn't let other apps post to Marketplace for
 * individuals, so this makes it quick by hand: copy the text, save the photos, open Marketplace,
 * and keep the listing's link here (it shows on the item, and reminds you to mark it sold there).
 */
export function ListElsewhere({ item }: { item: Item }) {
  const [channels, setChannels] = useState<Channels>(item.channels);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function copy() {
    await navigator.clipboard.writeText(listingText(item, window.location.origin));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function savePhotos() {
    setBusy("photos");
    setError(null);
    try {
      const files = await Promise.all(
        item.photos.map(async (p, i) => {
          const blob = await (await fetch(p.url)).blob();
          return new File([blob], `${item.slug}-${i + 1}.jpg`, { type: blob.type || "image/jpeg" });
        }),
      );
      // On a phone: the share sheet, with "Save Images" (iPhone) or the Facebook app itself.
      if (navigator.canShare?.({ files })) await navigator.share({ files, text: listingText(item, window.location.origin) });
      else
        for (const f of files) {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(f);
          a.download = f.name;
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError("Couldn't get the photos. Try again.");
    }
    setBusy(null);
  }

  async function save(next: Channels) {
    setBusy("save");
    setError(null);
    try {
      const { item: saved } = await sellApi<{ item: Item }>("PATCH", `/api/sell/items/${item.id}`, { channels: next });
      setChannels(saved.channels);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  }

  return (
    <section id="elsewhere" className="mx-auto mt-8 max-w-lg scroll-mt-4 px-4">
      <h2 className="text-xl">List it elsewhere too</h2>
      <p className="mt-1 text-sm text-muted">One tap to copy, one to save the photos, then paste into the other app.</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" className="btn btn-outline" onClick={copy}>
          {copied ? "Copied ✓" : "Copy listing text"}
        </button>
        <button type="button" className="btn btn-outline" onClick={savePhotos} disabled={!item.photos.length || busy === "photos"}>
          {busy === "photos" ? "Getting photos…" : "Save the photos"}
        </button>
      </div>
      <div className="mt-4 space-y-3">
        {PLACES.map((p) => (
          <Place key={p.key} place={p} listing={channels[p.key]} busy={busy === "save"} onSave={(url) => save({ ...channels, [p.key]: url ? { ...channels[p.key], url } : undefined })} />
        ))}
      </div>
      {error && <p className="mt-3 text-sm font-bold text-berry">{error}</p>}
    </section>
  );
}

function Place({ place, listing, busy, onSave }: { place: (typeof PLACES)[number]; listing?: { url?: string; listedAt?: string }; busy: boolean; onSave: (url: string | null) => void }) {
  const [url, setUrl] = useState(listing?.url ?? "");
  const listed = Boolean(listing);
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-bold">
          {place.name} {listed && <span className="ml-1 rounded-md bg-leaf-light px-1.5 py-0.5 text-xs text-leaf">Listed</span>}
        </p>
        <a href={place.create} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-tag-dark underline underline-offset-4">
          Open ↗
        </a>
      </div>
      {place.hint && !listed && <p className="mt-1 text-sm text-muted">{place.hint}</p>}
      <div className="mt-2 flex gap-2">
        <input type="url" inputMode="url" placeholder="Paste the listing's link" value={url} onChange={(e) => setUrl(e.target.value)} className="field min-h-11 flex-1 text-sm" />
        <button type="button" className="btn btn-dark min-h-11 px-4 text-sm" disabled={busy} onClick={() => onSave(url.trim() || null)}>
          {listed && !url.trim() ? "Remove" : "Save"}
        </button>
      </div>
    </div>
  );
}
