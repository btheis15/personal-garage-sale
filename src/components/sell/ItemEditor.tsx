"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CATEGORIES, CONDITIONS } from "@/lib/site";
import type { Condition, Item, ItemStatus } from "@/lib/types";
import { CameraIcon, CheckIcon, ChevronLeft, ChevronRight, CloseIcon } from "../icons";
import { dollars, sellApi, toCents, uploadPhotos, type Uploaded } from "./api";

type PhotoSlot = Uploaded & { key: string; uploading?: boolean; preview?: string };

const DRAFT_KEY = "sell.new-item-draft";

/**
 * Adding or changing an item. Built for a phone in one hand: photos first (camera or library),
 * then the price, a title, and a tap for the condition. Everything else is under "More".
 */
export function ItemEditor({ item, shippingOn, defaultShippingCents }: { item?: Item; shippingOn: boolean; defaultShippingCents: number }) {
  const router = useRouter();
  const isNew = !item;
  const [photos, setPhotos] = useState<PhotoSlot[]>(() => (item?.photos ?? []).map((p) => ({ ...p, key: p.path })));
  const [title, setTitle] = useState(item?.title ?? "");
  const [price, setPrice] = useState(dollars(item?.priceCents));
  const [description, setDescription] = useState(item?.description ?? "");
  const [condition, setCondition] = useState<Condition>(item?.condition ?? "good");
  const [category, setCategory] = useState(item?.category ?? "");
  const [quantity, setQuantity] = useState(String(item?.quantity ?? 1));
  const [obo, setObo] = useState(item?.obo ?? false);
  const [wasPrice, setWasPrice] = useState(dollars(item?.compareAtCents));
  const [pickup, setPickup] = useState(item?.pickup ?? true);
  const [ships, setShips] = useState(item?.ships ?? false);
  const [shipping, setShipping] = useState(dollars(item?.shippingCents));
  const [featured, setFeatured] = useState(item?.featured ?? false);
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState<ItemStatus | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [posted, setPosted] = useState<Item | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const uploading = photos.some((p) => p.uploading);

  // A new item in progress survives the app being closed (the photos are already uploaded).
  useEffect(() => {
    if (!isNew) return;
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null");
      if (d && Date.now() - d.at < 3 * 86_400_000) {
        /* eslint-disable react-hooks/set-state-in-effect */
        setPhotos(d.photos ?? []);
        setTitle(d.title ?? "");
        setPrice(d.price ?? "");
        setDescription(d.description ?? "");
        setCondition(d.condition ?? "good");
        setCategory(d.category ?? "");
        /* eslint-enable react-hooks/set-state-in-effect */
      }
    } catch {
      /* fine */
    }
  }, [isNew]);
  useEffect(() => {
    if (!isNew || posted) return;
    try {
      const done = photos.filter((p) => !p.uploading).map(({ preview: _preview, ...p }) => p);
      if (done.length || title || price) localStorage.setItem(DRAFT_KEY, JSON.stringify({ at: Date.now(), photos: done, title, price, description, condition, category }));
    } catch {
      /* fine */
    }
  }, [isNew, posted, photos, title, price, description, condition, category]);

  async function addFiles(list: FileList | null) {
    const files = [...(list ?? [])].filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name)).slice(0, 12 - photos.length);
    if (!files.length) return;
    setError(null);
    const keys = files.map(() => Math.random().toString(36).slice(2));
    setPhotos((ps) => [...ps, ...files.map((f, i) => ({ key: keys[i], path: "", url: "", width: 0, height: 0, uploading: true, preview: URL.createObjectURL(f) }))]);
    try {
      await uploadPhotos(files, (i, up) => setPhotos((ps) => ps.map((p) => (p.key === keys[i] ? { ...p, ...up, uploading: false } : p))));
    } catch (e) {
      setError((e as Error).message);
      setPhotos((ps) => ps.filter((p) => !(keys.includes(p.key) && p.uploading)));
    }
  }

  const move = (i: number, by: number) =>
    setPhotos((ps) => {
      const next = [...ps];
      const [p] = next.splice(i, 1);
      next.splice(Math.max(0, Math.min(next.length, i + by)), 0, p);
      return next;
    });

  async function save(status: ItemStatus) {
    setError(null);
    const priceCents = toCents(price);
    if (!title.trim()) return setError("Give it a title.");
    if (priceCents === null) return setError("Give it a price (0 for free).");
    if (uploading) return setError("Wait for the photos to finish uploading.");
    setBusy(status);
    const body = {
      title,
      priceCents,
      description,
      condition,
      category: category || "other",
      photos: photos.map(({ path, width, height }) => ({ path, width, height })),
      status,
      quantity: Number(quantity) || 1,
      obo,
      compareAtCents: toCents(wasPrice),
      pickup,
      ships,
      shippingCents: ships ? toCents(shipping) : null,
      featured,
      notes,
    };
    try {
      const { item: saved } = await sellApi<{ item: Item }>(isNew ? "POST" : "PATCH", isNew ? "/api/sell/items" : `/api/sell/items/${item.id}`, body);
      if (isNew) {
        try {
          localStorage.removeItem(DRAFT_KEY);
        } catch {
          /* fine */
        }
        setPosted(saved);
      } else {
        router.push("/sell");
        router.refresh();
      }
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  }

  async function remove() {
    if (!item || !confirm(`Delete “${item.title}” for good? (To take it off the shop but keep it, use Hide.)`)) return;
    setBusy("delete");
    try {
      await sellApi("DELETE", `/api/sell/items/${item.id}`);
      router.push("/sell");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  function startOver() {
    setPhotos([]);
    setTitle("");
    setPrice("");
    setDescription("");
    setCondition("good");
    setCategory("");
    setQuantity("1");
    setObo(false);
    setWasPrice("");
    setShips(false);
    setShipping("");
    setFeatured(false);
    setNotes("");
    setPosted(null);
    window.scrollTo({ top: 0 });
  }

  if (posted) return <Posted item={posted} onAnother={startOver} />;

  const chip = (on: boolean) => `shrink-0 rounded-full border-2 px-3.5 py-2 text-sm font-bold transition ${on ? "border-ink bg-ink text-paper" : "border-line bg-white"}`;

  return (
    <div className="mx-auto max-w-lg px-4 pt-4">
      <header className="mb-4 flex items-center gap-2">
        <Link href="/sell" className="-ml-2 grid size-11 place-items-center rounded-lg" aria-label="Back">
          <ChevronLeft />
        </Link>
        <h1 className="text-2xl">{isNew ? "Sell something" : "Edit item"}</h1>
      </header>

      {/* Photos */}
      <section>
        <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} />
        <input ref={library} type="file" accept="image/*" multiple className="hidden" onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} />
        {photos.length === 0 ? (
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => camera.current?.click()} className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-tag bg-tag-light/60 font-bold text-tag-dark">
              <CameraIcon size={40} />
              Take a photo
            </button>
            <button type="button" onClick={() => library.current?.click()} className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-kraft-dark bg-white font-bold">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="M3 16l5-5 4 4 3-3 6 6" />
                <circle cx="16" cy="9" r="1.5" />
              </svg>
              From library
            </button>
          </div>
        ) : (
          <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
            {photos.map((p, i) => (
              <div key={p.key} className="relative size-32 shrink-0 overflow-hidden rounded-2xl bg-kraft">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.preview ?? p.url} alt="" className={`size-full object-cover ${p.uploading ? "opacity-50" : ""}`} />
                {p.uploading && <span className="absolute inset-0 grid place-items-center"><span className="size-8 animate-spin rounded-full border-4 border-white border-t-tag" /></span>}
                {i === 0 && <span className="absolute top-1.5 left-1.5 rounded-md bg-ink/80 px-1.5 text-xs font-bold text-white">Main</span>}
                <button type="button" onClick={() => setPhotos((ps) => ps.filter((x) => x.key !== p.key))} className="absolute top-1.5 right-1.5 grid size-7 place-items-center rounded-full bg-white/90 shadow" aria-label="Remove photo">
                  <CloseIcon size={14} />
                </button>
                {photos.length > 1 && (
                  <div className="absolute inset-x-1.5 bottom-1.5 flex justify-between">
                    <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="grid size-7 place-items-center rounded-full bg-white/90 shadow disabled:invisible" aria-label="Move left">
                      <ChevronLeft size={14} />
                    </button>
                    <button type="button" disabled={i === photos.length - 1} onClick={() => move(i, 1)} className="grid size-7 place-items-center rounded-full bg-white/90 shadow disabled:invisible" aria-label="Move right">
                      <ChevronRight size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))}
            {photos.length < 12 && (
              <div className="flex shrink-0 flex-col gap-2">
                <button type="button" onClick={() => camera.current?.click()} className="grid h-[3.75rem] w-24 place-items-center rounded-2xl border-2 border-dashed border-tag bg-tag-light/60 text-tag-dark" aria-label="Take another photo">
                  <CameraIcon />
                </button>
                <button type="button" onClick={() => library.current?.click()} className="grid h-[3.75rem] w-24 place-items-center rounded-2xl border-2 border-dashed border-kraft-dark bg-white text-sm font-bold">
                  + Library
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* The essentials */}
      <section className="mt-5 space-y-4">
        <label className="block">
          <span className="eyebrow">Price</span>
          <span className="relative mt-1 block">
            <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-2xl font-bold text-muted">$</span>
            <input inputMode="decimal" placeholder="0" value={price} onChange={(e) => setPrice(e.target.value)} className="field h-16 pl-9 text-3xl font-bold" />
          </span>
        </label>
        <label className="block">
          <span className="eyebrow">What is it?</span>
          <input placeholder="e.g. Oak bookshelf, 5 shelves" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} autoCapitalize="sentences" className="field mt-1 text-lg" />
        </label>
        <div>
          <span className="eyebrow">Condition</span>
          <div className="no-scrollbar -mx-4 mt-1 flex gap-2 overflow-x-auto px-4">
            {CONDITIONS.map((c) => (
              <button key={c.value} type="button" onClick={() => setCondition(c.value)} className={chip(condition === c.value)}>
                {c.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="eyebrow">Category</span>
          <div className="mt-1 flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button key={c.value} type="button" onClick={() => setCategory(c.value)} className={chip(category === c.value)}>
                {c.label}
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="eyebrow">A few words (optional)</span>
          <textarea rows={3} placeholder="Size, brand, any flaws, why you're selling…" value={description} onChange={(e) => setDescription(e.target.value)} className="field mt-1" />
        </label>
      </section>

      {/* More */}
      <section className="mt-4 rounded-2xl border border-line bg-white">
        <button type="button" onClick={() => setMore((m) => !m)} className="flex w-full items-center justify-between p-4 font-bold" aria-expanded={more}>
          More options
          <span className="text-sm font-normal text-muted">{[obo && "OBO", ships && "ships", Number(quantity) > 1 && `${quantity} of them`, featured && "featured"].filter(Boolean).join(" · ") || "quantity, offers, shipping…"}</span>
        </button>
        {more && (
          <div className="space-y-4 border-t border-line p-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="eyebrow">How many</span>
                <input inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ""))} className="field mt-1" />
              </label>
              <label className="block">
                <span className="eyebrow">Was (optional)</span>
                <input inputMode="decimal" placeholder="$" value={wasPrice} onChange={(e) => setWasPrice(e.target.value)} className="field mt-1" />
              </label>
            </div>
            <Toggle on={obo} set={setObo} label="Or best offer" hint="Shows “or best offer” and a button to message you" />
            <Toggle on={pickup} set={setPickup} label="Local pickup" />
            {shippingOn ? (
              <>
                <Toggle on={ships} set={setShips} label="Can ship it" hint="US only" />
                {ships && (
                  <label className="block">
                    <span className="eyebrow">Shipping price</span>
                    <input inputMode="decimal" placeholder={`$${dollars(defaultShippingCents)} (the default)`} value={shipping} onChange={(e) => setShipping(e.target.value)} className="field mt-1" />
                  </label>
                )}
              </>
            ) : (
              <p className="text-sm text-muted">Shipping is off (Settings → Shipping).</p>
            )}
            <Toggle on={featured} set={setFeatured} label="Feature it" hint="Shows at the top of the home page" />
            <label className="block">
              <span className="eyebrow">Private notes</span>
              <textarea rows={2} placeholder="Only you see these: where it is, what you paid…" value={notes} onChange={(e) => setNotes(e.target.value)} className="field mt-1" />
            </label>
          </div>
        )}
      </section>

      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-berry/10 p-3 text-sm font-bold text-berry">
          {error}
        </p>
      )}

      <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] mt-6 -mx-4 space-y-2 bg-gradient-to-t from-paper via-paper to-transparent px-4 pt-4 pb-3">
        <button type="button" className="btn btn-primary w-full text-lg" disabled={busy !== null || uploading} onClick={() => save("live")}>
          {busy === "live" ? "Posting…" : uploading ? "Uploading photos…" : item?.status === "live" ? "Save" : "Post it"}
        </button>
        <div className="flex gap-2">
          <button type="button" className="btn btn-outline flex-1" disabled={busy !== null || uploading} onClick={() => save("draft")}>
            {busy === "draft" ? "Saving…" : "Save as draft"}
          </button>
          {item && item.status !== "sold" && (
            <button type="button" className="btn btn-outline flex-1" disabled={busy !== null} onClick={() => save("sold")}>
              {busy === "sold" ? "Saving…" : "Mark sold"}
            </button>
          )}
          {item && item.status === "live" && (
            <button type="button" className="btn btn-outline flex-1" disabled={busy !== null} onClick={() => save("hidden")}>
              Hide
            </button>
          )}
        </div>
        {item && (
          <button type="button" className="w-full py-2 text-sm text-berry underline underline-offset-4" disabled={busy !== null} onClick={remove}>
            Delete for good
          </button>
        )}
      </div>
    </div>
  );
}

function Toggle({ on, set, label, hint }: { on: boolean; set: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => set(!on)} className="flex w-full items-center justify-between gap-3 text-left">
      <span>
        <span className="block font-bold">{label}</span>
        {hint && <span className="block text-sm text-muted">{hint}</span>}
      </span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition ${on ? "bg-leaf" : "bg-kraft-dark"}`}>
        <span className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition-all ${on ? "left-[1.375rem]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

function Posted({ item, onAnother }: { item: Item; onAnother: () => void }) {
  const url = typeof window !== "undefined" ? `${window.location.origin}/item/${item.slug}` : `/item/${item.slug}`;
  const live = item.status === "live";
  return (
    <div className="mx-auto max-w-lg px-4 pt-10 text-center">
      <span className="animate-pop mx-auto grid size-16 place-items-center rounded-full bg-leaf text-white">
        <CheckIcon size={34} strokeWidth={3} />
      </span>
      <h1 className="mt-4 text-3xl">{live ? "It's in the shop!" : "Saved as a draft"}</h1>
      {item.photos[0] && (
        <div className="relative mx-auto mt-5 size-40 overflow-hidden rounded-2xl bg-kraft">
          <Image src={item.photos[0].url} alt="" fill sizes="160px" className="object-cover" />
        </div>
      )}
      <p className="mt-3 text-lg font-bold">{item.title}</p>
      <div className="mt-6 grid gap-2">
        <button type="button" className="btn btn-primary" onClick={onAnother}>
          Sell another
        </button>
        {live && (
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => (navigator.share ? navigator.share({ title: item.title, url }).catch(() => {}) : navigator.clipboard.writeText(url))}
          >
            Share the link
          </button>
        )}
        <Link href={`/sell/items/${item.id}#elsewhere`} className="btn btn-outline">
          Post it on Facebook Marketplace too
        </Link>
        {live && (
          <a href={`/item/${item.slug}`} className="btn btn-outline">
            See it in the shop
          </a>
        )}
      </div>
    </div>
  );
}
