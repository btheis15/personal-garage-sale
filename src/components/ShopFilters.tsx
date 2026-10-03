"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { SearchIcon } from "./icons";

type Current = { category: string; q: string; sort: string; sold: boolean; ships: boolean };

export function ShopFilters({ categories, sorts, current }: { categories: { value: string; label: string }[]; sorts: Record<string, string>; current: Current }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(current.q);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (params.get("focus") === "search") input.current?.focus();
  }, [params]);

  function go(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    next.delete("focus");
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    start(() => router.replace(`${path}${next.size ? `?${next}` : ""}`, { scroll: false }));
  }

  // Search as you type, a moment after the last key.
  useEffect(() => {
    if (q === current.q) return;
    const t = setTimeout(() => go({ q: q.trim() || null }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const chip = (active: boolean) => `shrink-0 rounded-full border px-4 py-2 text-sm font-bold transition ${active ? "border-ink bg-ink text-paper" : "border-line bg-white hover:border-ink"}`;

  return (
    <div className={`mt-5 space-y-3 transition-opacity ${pending ? "opacity-60" : ""}`}>
      <label className="relative block">
        <span className="sr-only">Search</span>
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" size={20} />
        <input ref={input} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: lamp, bike, Lego…" className="field pl-10" />
      </label>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        <button type="button" className={chip(!current.category)} onClick={() => go({ category: null })}>
          All
        </button>
        {categories.map((c) => (
          <button key={c.value} type="button" className={chip(current.category === c.value)} onClick={() => go({ category: current.category === c.value ? null : c.value })}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          Sort
          <select value={current.sort} onChange={(e) => go({ sort: e.target.value === "new" ? null : e.target.value })} className="rounded-lg border border-line bg-white px-2 py-1.5">
            {Object.entries(sorts).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={current.ships} onChange={(e) => go({ ships: e.target.checked ? "1" : null })} className="size-4 accent-tag" />
          Ships
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={current.sold} onChange={(e) => go({ sold: e.target.checked ? "1" : null })} className="size-4 accent-tag" />
          Show sold
        </label>
      </div>
    </div>
  );
}
