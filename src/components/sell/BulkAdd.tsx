"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CATEGORIES } from "@/lib/site";
import type { Item } from "@/lib/types";
import { CheckIcon, ChevronLeft, CloseIcon } from "../icons";
import { ItemPhoto } from "../ItemPhoto";
import { sellApi, toCents, uploadPhotos, type Uploaded } from "./api";

type Shot = Partial<Uploaded> & { key: string; preview: string; uploading: boolean };
type Row = { key: string; shots: Shot[]; title: string; price: string; category: string };

const LAST_KEY = "sell.last-choices";

/**
 * Clearing out a closet or the garage: pick a pile of photos at once, and each one becomes an
 * item. Type a name and a price under each, tap "goes with the one above" for a second photo of
 * the same thing, then post them all in one go.
 */
export function BulkAdd() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [category, setCategory] = useState("other");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Item[] | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const last = JSON.parse(localStorage.getItem(LAST_KEY) ?? "null");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (last?.category) setCategory(last.category);
    } catch {
      /* fine */
    }
  }, []);

  const uploading = rows.some((r) => r.shots.some((s) => s.uploading));
  const patchShot = (key: string, patch: Partial<Shot> | null) =>
    setRows((rs) => rs.map((r) => ({ ...r, shots: patch ? r.shots.map((s) => (s.key === key ? { ...s, ...patch } : s)) : r.shots.filter((s) => s.key !== key) })).filter((r) => r.shots.length));

  async function pick(list: FileList | null) {
    const files = [...(list ?? [])].slice(0, 40);
    if (!files.length) return;
    setError(null);
    const shots = files.map((f) => ({ key: Math.random().toString(36).slice(2), preview: URL.createObjectURL(f), uploading: true }));
    setRows((rs) => [...rs, ...shots.map((s) => ({ key: s.key, shots: [s], title: "", price: "", category }))]);
    await uploadPhotos(files, (i, up, err) => {
      if (up) patchShot(shots[i].key, { ...up, uploading: false });
      else {
        setError(err ?? "A photo didn't upload.");
        patchShot(shots[i].key, null);
      }
    });
  }

  const set = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  /** This photo is another view of the item above: move it there. */
  const joinAbove = (i: number) =>
    setRows((rs) => {
      const next = [...rs];
      next[i - 1] = { ...next[i - 1], shots: [...next[i - 1].shots, ...next[i].shots], title: next[i - 1].title || next[i].title, price: next[i - 1].price || next[i].price };
      next.splice(i, 1);
      return next;
    });

  async function postAll() {
    setError(null);
    const missing = rows.findIndex((r) => !r.title.trim() || toCents(r.price) === null);
    if (missing >= 0) return setError(`Item ${missing + 1} needs a name and a price.`);
    setBusy(true);
    try {
      const { items } = await sellApi<{ items: Item[] }>("POST", "/api/sell/items/many", {
        items: rows.map((r) => ({
          title: r.title,
          priceCents: toCents(r.price),
          category: r.category,
          condition: "good",
          status: "live",
          photos: r.shots.map(({ id, width, height, maxWidth }) => ({ id, width, height, maxWidth })),
        })),
      });
      try {
        localStorage.setItem(LAST_KEY, JSON.stringify({ category: rows.at(-1)?.category ?? category, condition: "good" }));
      } catch {
        /* fine */
      }
      setDone(items);
      setRows([]);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  if (done)
    return (
      <div className="mx-auto max-w-lg px-4 pt-10 text-center">
        <span className="animate-pop mx-auto grid size-16 place-items-center rounded-full bg-leaf text-white">
          <CheckIcon size={34} strokeWidth={3} />
        </span>
        <h1 className="mt-4 text-3xl">{done.length} {done.length === 1 ? "item is" : "items are"} in the shop</h1>
        <div className="mt-6 grid gap-2">
          <button type="button" className="btn btn-primary" onClick={() => (setDone(null), picker.current?.click())}>
            Add another batch
          </button>
          <Link href="/sell" className="btn btn-outline">
            See all my items
          </Link>
        </div>
        <input ref={picker} type="file" accept="image/*" multiple className="hidden" onChange={(e) => (pick(e.target.files), (e.target.value = ""))} />
      </div>
    );

  return (
    <div className="mx-auto max-w-lg px-4 pt-4">
      <header className="mb-2 flex items-center gap-2">
        <Link href="/sell/new" className="-ml-2 grid size-11 place-items-center rounded-lg" aria-label="Back">
          <ChevronLeft />
        </Link>
        <h1 className="text-2xl">Add several</h1>
      </header>
      <p className="text-sm text-muted">Pick a photo of each thing (one tap each in your library). Then a name and a price under each one, and post them all. You can add details to any of them later.</p>

      <input ref={picker} type="file" accept="image/*" multiple className="hidden" onChange={(e) => (pick(e.target.files), (e.target.value = ""))} />
      {!rows.length && (
        <>
          <div className="mt-4">
            <span className="eyebrow">What kind of things?</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="field mt-1">
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <button type="button" onClick={() => picker.current?.click()} className="mt-4 flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-tag/60 bg-tag-light py-10 font-bold text-tag">
            <span className="text-3xl">+</span>
            Choose photos
          </button>
        </>
      )}

      <ol className="mt-4 space-y-3">
        {rows.map((r, i) => (
          <li key={r.key} className="rounded-xl border border-line bg-white p-3">
            <div className="flex gap-3">
              <div className="flex shrink-0 flex-col gap-1">
                {r.shots.map((s) => (
                  <div key={s.key} className="relative size-20 overflow-hidden rounded-lg bg-kraft">
                    {s.uploading ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.preview} alt="" className="size-full object-cover opacity-50" />
                    ) : (
                      <ItemPhoto url={s.url} alt="" sizes="80px" />
                    )}
                    {s.uploading && (
                      <span className="absolute inset-0 grid place-items-center">
                        <span className="size-6 animate-spin rounded-full border-4 border-white border-t-tag" />
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex gap-2">
                  <input placeholder={`What is it? (${i + 1})`} value={r.title} onChange={(e) => set(r.key, { title: e.target.value })} autoCapitalize="sentences" className="field min-h-11 flex-1" />
                  <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} className="grid size-11 shrink-0 place-items-center rounded-lg text-muted hover:bg-kraft" aria-label="Remove">
                    <CloseIcon size={18} />
                  </button>
                </div>
                <div className="flex gap-2">
                  <span className="relative w-28 shrink-0">
                    <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-bold text-muted">$</span>
                    <input inputMode="decimal" placeholder="Price" value={r.price} onChange={(e) => set(r.key, { price: e.target.value })} className="field min-h-11 pl-7 font-bold" />
                  </span>
                  <select value={r.category} onChange={(e) => set(r.key, { category: e.target.value })} className="field min-h-11 min-w-0 flex-1 text-sm" aria-label="Kind of thing">
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                {i > 0 && (
                  <button type="button" onClick={() => joinAbove(i)} className="text-sm font-bold text-tag underline underline-offset-4">
                    ↑ Same thing as the one above
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>

      {rows.length > 0 && (
        <>
          <button type="button" onClick={() => picker.current?.click()} className="btn btn-outline mt-3 w-full">
            + More photos
          </button>
          {error && <p className="mt-3 rounded-lg bg-berry/10 p-3 text-sm font-bold text-berry">{error}</p>}
          <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] -mx-4 mt-4 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur">
            <button type="button" className="btn btn-primary w-full text-lg" disabled={busy || uploading} onClick={postAll}>
              {busy ? "Posting…" : uploading ? "Uploading photos…" : `Post ${rows.length} ${rows.length === 1 ? "item" : "items"}`}
            </button>
          </div>
        </>
      )}
      {!rows.length && error && <p className="mt-3 rounded-lg bg-berry/10 p-3 text-sm font-bold text-berry">{error}</p>}
    </div>
  );
}
