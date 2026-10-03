"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CATEGORIES, CONDITIONS, SIZES } from "@/lib/site";
import type { Condition, Item, ItemStatus } from "@/lib/types";
import { CameraIcon, CheckIcon, ChevronLeft, ChevronRight, CloseIcon } from "../icons";
import { ItemPhoto } from "../ItemPhoto";
import { dollars, sellApi, toCents, uploadPhotos, type Uploaded } from "./api";
import { ShareSheet } from "./ShareSheet";

type PhotoSlot = Partial<Uploaded> & { key: string; uploading?: boolean; preview?: string };

const DRAFT_KEY = "sell.new-item-draft";
const LAST_KEY = "sell.last-choices";
const QUICK_PRICES = [100, 200, 500, 1000, 2000, 5000];

const read = (k: string) => {
  try {
    return JSON.parse(localStorage.getItem(k) ?? "null");
  } catch {
    return null;
  }
};
const write = (k: string, v: unknown) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* private mode: fine */
  }
};

/**
 * Adding or changing an item, built for a phone in one hand: photos first (camera or library),
 * then a price (one tap for the usual ones), what it is, and a tap for the kind of thing. Clothes
 * get a size and brand. Everything else is under "More". The category you used last is picked for
 * you, so a pile of kids' clothes goes quickly.
 */
export function ItemEditor({ item, shippingOn, defaultShippingCents, shopName }: { item?: Item; shippingOn: boolean; defaultShippingCents: number; shopName: string }) {
  const router = useRouter();
  const isNew = !item;
  const [photos, setPhotos] = useState<PhotoSlot[]>(() => (item?.photos ?? []).map((p) => ({ ...p, id: p.id, maxWidth: p.maxWidth ?? p.width, key: p.id ?? p.url })));
  const [title, setTitle] = useState(item?.title ?? "");
  const [price, setPrice] = useState(dollars(item?.priceCents));
  const [description, setDescription] = useState(item?.description ?? "");
  const [condition, setCondition] = useState<Condition>(item?.condition ?? "good");
  const [category, setCategory] = useState(item?.category ?? "");
  const [size, setSize] = useState(item?.size ?? "");
  const [brand, setBrand] = useState(item?.brand ?? "");
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
  const [sharing, setSharing] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const uploading = photos.some((p) => p.uploading);
  const clothing = category === "clothing";

  // A new item picks up where you left off (the photos are already uploaded), and the kind of
  // thing you added last.
  useEffect(() => {
    if (!isNew) return;
    const d = read(DRAFT_KEY);
    const last = read(LAST_KEY);
    /* eslint-disable react-hooks/set-state-in-effect */
    if (d && Date.now() - d.at < 3 * 86_400_000) {
      setPhotos(d.photos ?? []);
      setTitle(d.title ?? "");
      setPrice(d.price ?? "");
      setDescription(d.description ?? "");
      setCondition(d.condition ?? "good");
      setCategory(d.category ?? last?.category ?? "");
      setSize(d.size ?? "");
      setBrand(d.brand ?? "");
    } else if (last) {
      setCategory(last.category ?? "");
      setCondition(last.condition ?? "good");
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [isNew]);
  useEffect(() => {
    if (!isNew || posted) return;
    const done = photos.filter((p) => !p.uploading && p.id).map(({ preview: _p, ...rest }) => rest);
    if (done.length || title || price) write(DRAFT_KEY, { at: Date.now(), photos: done, title, price, description, condition, category, size, brand });
  }, [isNew, posted, photos, title, price, description, condition, category, size, brand]);

  async function addFiles(list: FileList | null) {
    const files = [...(list ?? [])].slice(0, 12 - photos.length);
    if (!files.length) return;
    setError(null);
    const keys = files.map(() => Math.random().toString(36).slice(2));
    setPhotos((ps) => [...ps, ...files.map((f, i) => ({ key: keys[i], uploading: true, preview: URL.createObjectURL(f) }))]);
    await uploadPhotos(files, (i, up, err) => {
      if (up) setPhotos((ps) => ps.map((p) => (p.key === keys[i] ? { ...p, ...up, uploading: false } : p)));
      else {
        setError(err ?? "A photo didn't upload.");
        setPhotos((ps) => ps.filter((p) => p.key !== keys[i]));
      }
    });
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
    if (!title.trim()) return setError("Say what it is (a few words is plenty).");
    if (priceCents === null) return setError("Give it a price (0 for free).");
    if (uploading) return setError("Wait a moment for the photos to finish uploading.");
    if (status === "live" && !photos.length) return setError("Add a photo first, or save it as a draft.");
    setBusy(status);
    const body = {
      title,
      priceCents,
      description,
      condition,
      category: category || "other",
      size: clothing ? size : "",
      brand,
      photos: photos.map(({ id, width, height, maxWidth }) => ({ id, width, height, maxWidth })),
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
        write(DRAFT_KEY, null);
        write(LAST_KEY, { category: category || "other", condition });
        setPosted(saved);
        window.scrollTo({ top: 0 });
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

  /** Clears the form for the next one, keeping the kind of thing and condition. */
  function another(openCamera: boolean) {
    setPhotos([]);
    setTitle("");
    setPrice("");
    setDescription("");
    setSize("");
    setBrand("");
    setQuantity("1");
    setObo(false);
    setWasPrice("");
    setShips(false);
    setShipping("");
    setFeatured(false);
    setNotes("");
    setPosted(null);
    setSharing(false);
    router.refresh();
    if (openCamera) camera.current?.click();
  }

  const chip = (on: boolean) => `shrink-0 rounded-full border px-3.5 py-2 text-sm font-bold transition ${on ? "border-tag bg-tag text-white" : "border-line bg-white text-ink"}`;
  const fileInputs = (
    <>
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} />
      <input ref={library} type="file" accept="image/*" multiple className="hidden" onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} />
    </>
  );

  if (posted)
    return (
      <div className="mx-auto max-w-lg px-4 pt-10 text-center">
        {fileInputs}
        <span className="animate-pop mx-auto grid size-16 place-items-center rounded-full bg-leaf text-white">
          <CheckIcon size={34} strokeWidth={3} />
        </span>
        <h1 className="mt-4 text-3xl">{posted.status === "live" ? "It's in the shop" : "Saved as a draft"}</h1>
        {posted.photos[0] && (
          <div className="relative mx-auto mt-5 size-40 overflow-hidden rounded-xl bg-kraft">
            <ItemPhoto url={posted.photos[0].url} alt="" sizes="160px" />
          </div>
        )}
        <p className="mt-3 text-lg font-bold">{posted.title}</p>
        <div className="mt-6 grid gap-2">
          <button type="button" className="btn btn-primary" onClick={() => another(true)}>
            <CameraIcon /> Sell another
          </button>
          {posted.status === "live" && (
            <button type="button" className="btn btn-outline" onClick={() => setSharing(true)}>
              Share it / show the QR code
            </button>
          )}
          <Link href={`/sell/items/${posted.id}#elsewhere`} className="btn btn-outline">
            Post it on Facebook Marketplace too
          </Link>
          <Link href="/sell" className="py-2 text-sm text-muted underline underline-offset-4">
            Done for now
          </Link>
        </div>
        {sharing && <ShareSheet item={posted} shopName={shopName} onClose={() => setSharing(false)} />}
      </div>
    );

  return (
    <div className="mx-auto max-w-lg px-4 pt-4">
      {fileInputs}
      <header className="mb-4 flex items-center gap-2">
        <Link href="/sell" className="-ml-2 grid size-11 place-items-center rounded-lg" aria-label="Back">
          <ChevronLeft />
        </Link>
        <h1 className="flex-1 text-2xl">{isNew ? "Sell something" : "Edit item"}</h1>
        {item?.status === "live" && (
          <button type="button" className="btn btn-outline min-h-10 px-3 text-sm" onClick={() => setSharing(true)}>
            Share / QR
          </button>
        )}
        {isNew && (
          <Link href="/sell/bulk" className="text-sm font-bold text-tag underline underline-offset-4">
            Add several
          </Link>
        )}
      </header>

      {/* 1. Photos */}
      <section>
        {photos.length === 0 ? (
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => camera.current?.click()} className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-tag/60 bg-tag-light font-bold text-tag">
              <CameraIcon size={36} />
              Take a photo
            </button>
            <button type="button" onClick={() => library.current?.click()} className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-kraft-dark bg-white font-bold">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="M3 16l5-5 4 4 3-3 6 6" />
                <circle cx="16" cy="9" r="1.5" />
              </svg>
              Choose photos
            </button>
          </div>
        ) : (
          <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
            {photos.map((p, i) => (
              <div key={p.key} className="relative size-32 shrink-0 overflow-hidden rounded-xl bg-kraft">
                {p.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.preview} alt="" className={`size-full object-cover ${p.uploading ? "opacity-50" : ""}`} />
                ) : (
                  <ItemPhoto url={p.url} alt="" sizes="128px" />
                )}
                {p.uploading && (
                  <span className="absolute inset-0 grid place-items-center">
                    <span className="size-8 animate-spin rounded-full border-4 border-white border-t-tag" />
                  </span>
                )}
                {i === 0 && <span className="absolute top-1.5 left-1.5 rounded bg-ink/80 px-1.5 text-xs font-bold text-white">Main</span>}
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
                <button type="button" onClick={() => camera.current?.click()} className="grid h-[3.75rem] w-24 place-items-center rounded-xl border-2 border-dashed border-tag/60 bg-tag-light text-tag" aria-label="Take another photo">
                  <CameraIcon />
                </button>
                <button type="button" onClick={() => library.current?.click()} className="grid h-[3.75rem] w-24 place-items-center rounded-xl border-2 border-dashed border-kraft-dark bg-white text-sm font-bold">
                  + Photos
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="mt-5 space-y-5">
        {/* 2. Price */}
        <div>
          <label htmlFor="price" className="eyebrow">
            Price
          </label>
          <span className="relative mt-1 block">
            <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-2xl font-bold text-muted">$</span>
            <input id="price" inputMode="decimal" placeholder="0" value={price} onChange={(e) => setPrice(e.target.value)} className="field h-14 pl-9 text-2xl font-bold" />
          </span>
          <div className="no-scrollbar -mx-4 mt-2 flex gap-2 overflow-x-auto px-4">
            {QUICK_PRICES.map((c) => (
              <button key={c} type="button" onClick={() => setPrice(dollars(c))} className={chip(toCents(price) === c)}>
                ${c / 100}
              </button>
            ))}
            <button type="button" onClick={() => setPrice("0")} className={chip(price === "0")}>
              Free
            </button>
          </div>
        </div>

        {/* 3. What it is */}
        <label className="block">
          <span className="eyebrow">What is it?</span>
          <input placeholder={clothing ? "e.g. Boys' winter coat" : "e.g. Oak bookshelf, 5 shelves"} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} autoCapitalize="sentences" enterKeyHint="done" className="field mt-1 text-lg" />
        </label>

        {/* 4. Kind of thing */}
        <div>
          <span className="eyebrow">Kind of thing</span>
          <div className="mt-1 flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button key={c.value} type="button" onClick={() => setCategory(c.value)} className={chip(category === c.value)}>
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Clothes: size and brand */}
        {clothing && (
          <div className="space-y-3 rounded-xl border border-line bg-white p-4">
            <div>
              <span className="eyebrow">Size</span>
              <div className="mt-1 flex flex-wrap gap-2">
                {SIZES.map((s) => (
                  <button key={s} type="button" onClick={() => setSize(size === s ? "" : s)} className={chip(size === s)}>
                    {s}
                  </button>
                ))}
              </div>
              <input placeholder="Or type it: 10.5, 32×30, Girls 7/8…" value={SIZES.includes(size) ? "" : size} onChange={(e) => setSize(e.target.value)} maxLength={40} className="field mt-2" />
            </div>
            <label className="block">
              <span className="eyebrow">Brand (optional)</span>
              <input placeholder="e.g. Carhartt, Gap, Nike" value={brand} onChange={(e) => setBrand(e.target.value)} maxLength={60} className="field mt-1" />
            </label>
          </div>
        )}

        {/* 5. Condition */}
        <div>
          <span className="eyebrow">Condition</span>
          <div className="no-scrollbar -mx-4 mt-1 flex gap-2 overflow-x-auto px-4">
            {CONDITIONS.map((c) => (
              <button key={c.value} type="button" onClick={() => setCondition(c.value)} className={chip(condition === c.value)}>
                {c.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-sm text-muted">{CONDITIONS.find((c) => c.value === condition)?.hint}</p>
        </div>

        <label className="block">
          <span className="eyebrow">A few words (optional)</span>
          <textarea rows={3} placeholder="Size, how old, any flaws, why you're selling…" value={description} onChange={(e) => setDescription(e.target.value)} className="field mt-1" />
        </label>
      </section>

      {/* More */}
      <section className="mt-4 rounded-xl border border-line bg-white">
        <button type="button" onClick={() => setMore((m) => !m)} className="flex w-full items-center justify-between gap-3 p-4 text-left font-bold" aria-expanded={more}>
          More options
          <span className="text-sm font-normal text-muted">{[obo && "OBO", ships && "ships", Number(quantity) > 1 && `${quantity} of them`, featured && "featured", !clothing && brand].filter(Boolean).join(" · ") || "how many, offers, shipping…"}</span>
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
            {!clothing && (
              <label className="block">
                <span className="eyebrow">Brand (optional)</span>
                <input placeholder="e.g. KitchenAid, DeWalt" value={brand} onChange={(e) => setBrand(e.target.value)} maxLength={60} className="field mt-1" />
              </label>
            )}
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
              <p className="text-sm text-muted">Shipping is off (Settings).</p>
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
        <p role="alert" className="mt-4 rounded-lg bg-berry/10 p-3 text-sm font-bold text-berry">
          {error}
        </p>
      )}

      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] -mx-4 mt-6 space-y-2 border-t border-line bg-paper/95 px-4 pt-3 pb-3 backdrop-blur">
        <button type="button" className="btn btn-primary w-full text-lg" disabled={busy !== null || uploading} onClick={() => save("live")}>
          {busy === "live" ? "Posting…" : uploading ? "Uploading photos…" : item?.status === "live" ? "Save" : "Post it"}
        </button>
        <div className="flex gap-2">
          <button type="button" className="btn btn-outline flex-1" disabled={busy !== null || uploading} onClick={() => save("draft")}>
            {busy === "draft" ? "Saving…" : "Save draft"}
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
      </div>
      {item && (
        <button type="button" className="mt-2 w-full py-2 text-sm text-berry underline underline-offset-4" disabled={busy !== null} onClick={remove}>
          Delete for good
        </button>
      )}
      {sharing && item && <ShareSheet item={item} shopName={shopName} onClose={() => setSharing(false)} />}
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
