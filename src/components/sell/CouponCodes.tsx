"use client";

import { useState } from "react";
import type { CouponCode } from "@/lib/types";
import { dollars, toCents } from "./api";

/** One row while editing: everything is text, and goes up as numbers (the server checks it on Save). */
type Row = { code: string; kind: "amount" | "percent"; amount: string; percent: string; max: string; active: boolean };

const toRow = (c: CouponCode): Row => ({ code: c.code, kind: c.kind, amount: dollars(c.amountCents), percent: c.percent ? String(c.percent) : "", max: dollars(c.maxCents), active: c.active });

function toCode(r: Row): CouponCode {
  if (r.kind === "amount") return { code: r.code, kind: "amount", amountCents: toCents(r.amount) ?? 0, active: r.active };
  const maxCents = toCents(r.max);
  return { code: r.code, kind: "percent", percent: Number(r.percent) || 0, ...(maxCents ? { maxCents } : {}), active: r.active };
}

/** Settings → Coupon codes: codes shoppers can type at checkout. Saved with the rest of Settings. */
export function CouponCodes({ codes, onChange }: { codes: CouponCode[]; onChange: (codes: CouponCode[]) => void }) {
  const [rows, setRows] = useState<Row[]>(() => codes.map(toRow));

  function update(next: Row[]) {
    setRows(next);
    onChange(next.map(toCode));
  }
  const patch = (i: number, p: Partial<Row>) => update(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-white p-4">
      <p className="font-bold">Coupon codes</p>
      <p className="text-sm text-muted">Shoppers type a code at checkout to take money off the items (never the shipping). Turn a code off any time without deleting it. Remember to tap Save below.</p>
      {rows.map((r, i) => (
        <div key={i} className="space-y-2 rounded-xl border border-line p-3">
          <div className="flex items-center gap-2">
            <input value={r.code} onChange={(e) => patch(i, { code: e.target.value.toUpperCase() })} placeholder="CODE, like WELCOME10" className="field" maxLength={30} aria-label="Code" />
            <label className="flex shrink-0 items-center gap-2 text-sm font-bold">
              On
              <input type="checkbox" checked={r.active} onChange={(e) => patch(i, { active: e.target.checked })} className="size-5 accent-tag" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select value={r.kind} onChange={(e) => patch(i, { kind: e.target.value as Row["kind"] })} className="field" aria-label="Kind">
              <option value="amount">Dollars off</option>
              <option value="percent">Percent off</option>
            </select>
            {r.kind === "amount" ? (
              <input inputMode="decimal" value={r.amount} onChange={(e) => patch(i, { amount: e.target.value })} placeholder="$ off" className="field" aria-label="Dollars off" />
            ) : (
              <input inputMode="numeric" value={r.percent} onChange={(e) => patch(i, { percent: e.target.value.replace(/\D/g, "") })} placeholder="% off" className="field" aria-label="Percent off" />
            )}
          </div>
          {r.kind === "percent" && <input inputMode="decimal" value={r.max} onChange={(e) => patch(i, { max: e.target.value })} placeholder="Most it can take off, $ (optional)" className="field" aria-label="Most it can take off" />}
          <button type="button" onClick={() => update(rows.filter((_, j) => j !== i))} className="text-sm font-bold text-berry">
            Delete this code
          </button>
        </div>
      ))}
      {rows.length < 50 && (
        <button type="button" onClick={() => update([...rows, { code: "", kind: "percent", amount: "", percent: "10", max: "", active: true }])} className="btn btn-outline w-full">
          + Add a code
        </button>
      )}
    </div>
  );
}
