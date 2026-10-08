"use client";

import Link from "next/link";
import { useState } from "react";
import { money } from "@/lib/site";
import { ChevronLeft } from "../icons";
import { sellApi } from "./api";
import { ago } from "./OrderList";

export type PartnerRow = {
  id: string;
  code: string;
  name: string;
  email: string | null;
  address: string;
  ratePercent: number;
  ownRate: number | null;
  status: "active" | "paused" | "removed";
  country: string | null;
  usPerson: boolean;
  mailingAddress: string | null;
  termsVersion: string | null;
  termsAcceptedAt: string | null;
  createdAt: string;
  totals: { sales: number; paidCents: number; waitingCents: number };
  limit: { limitCents: number | null; leftCents: number | null; earnedCents: number };
};

/** Friends who signed up to spread the word: what they've sold and earned; pause them or give one their own rate. */
export function PartnerList({ initial, on, hotWallet }: { initial: PartnerRow[]; on: boolean; hotWallet: boolean }) {
  const [rows, setRows] = useState(initial);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function patch(id: string, body: Record<string, unknown>) {
    setError(null);
    try {
      const { partner } = await sellApi<{ partner: PartnerRow | null }>("PATCH", `/api/sell/partners/${id}`, body);
      setRows((r) => (partner ? r.map((x) => (x.id === id ? partner : x)) : r.filter((x) => x.id !== id)));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 pt-5">
      <Link href="/sell/settings" className="inline-flex items-center gap-1 text-sm font-bold text-muted">
        <ChevronLeft size={16} /> Settings
      </Link>
      <h1 className="mt-2 text-3xl">Spread the word</h1>
      <p className="text-sm text-muted">Friends sharing your sale. Their cut of Bitcoin Cash sales goes to them from the hot wallet as the buyer pays.</p>
      {!on && <p className="mt-3 rounded-xl bg-sun p-3 text-sm">It&apos;s off{hotWallet ? "" : " (and needs the hot wallet)"}: turn it on in Settings → Bitcoin Cash extras.</p>}
      {error && <p className="mt-3 rounded-xl bg-berry/10 p-3 text-sm font-bold text-berry">{error}</p>}

      {rows.length === 0 ? (
        <p className="mt-6 rounded-2xl bg-kraft p-5 text-center text-muted">No one yet. Send friends to your site&apos;s /share page.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {rows.map((p, i) => (
            <li key={p.id} className="animate-card-in rounded-2xl border border-line bg-white p-4" style={{ "--i": i } as React.CSSProperties}>
              <button type="button" className="flex w-full items-start gap-3 text-left" onClick={() => setOpen(open === p.id ? null : p.id)} aria-expanded={open === p.id}>
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-amber-light font-display text-lg text-tag-dark">{p.name.slice(0, 1)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">
                    {p.name} {p.status === "paused" && <span className="rounded-full bg-sun px-2 py-0.5 text-xs">Paused</span>}
                  </span>
                  <span className="block text-sm text-muted">
                    {p.totals.sales} sale{p.totals.sales === 1 ? "" : "s"} · {money(p.totals.paidCents)} paid
                    {p.totals.waitingCents ? ` · ${money(p.totals.waitingCents)} on its way` : ""} · {p.ratePercent}%
                  </span>
                </span>
              </button>
              {open === p.id && (
                <div className="animate-rise mt-3 space-y-2 border-t border-line pt-3 text-sm">
                  <p>
                    <span className="text-muted">Link code:</span> {p.code} · <span className="text-muted">joined</span> {ago(p.createdAt)}
                  </p>
                  {p.email && (
                    <p>
                      <a href={`mailto:${p.email}`} className="font-bold text-tag-dark underline">
                        {p.email}
                      </a>
                    </p>
                  )}
                  <p className="break-all">
                    <span className="text-muted">Pays to:</span> {p.address}
                  </p>
                  <p>
                    <span className="text-muted">Lives in:</span> {p.country ?? "?"} · {p.usPerson ? "US person" : "not a US person"}
                    {p.mailingAddress && <span className="block text-muted">{p.mailingAddress}</span>}
                  </p>
                  {p.limit.limitCents !== null && (
                    <p>
                      <span className="text-muted">This year:</span> {money(p.limit.earnedCents)} of {money(p.limit.limitCents)}
                    </p>
                  )}
                  <p className="text-muted">
                    Agreed to terms {p.termsVersion ?? "?"}
                    {p.termsAcceptedAt ? ` on ${new Date(p.termsAcceptedAt).toLocaleDateString("en-US")}` : ""}
                  </p>
                  <div className="flex items-end gap-2 pt-1">
                    <label className="flex-1">
                      <span className="eyebrow">Their own rate (%)</span>
                      <input
                        inputMode="numeric"
                        defaultValue={p.ownRate ?? ""}
                        placeholder={`Shop's (${p.ratePercent}%)`}
                        className="field mt-1"
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v !== String(p.ownRate ?? "")) void patch(p.id, { ratePercent: v === "" ? null : Number(v) });
                        }}
                      />
                    </label>
                    <button type="button" className="btn btn-outline" onClick={() => patch(p.id, { status: p.status === "paused" ? "active" : "paused" })}>
                      {p.status === "paused" ? "Resume" : "Pause"}
                    </button>
                  </div>
                  <button
                    type="button"
                    className="text-sm font-bold text-berry underline"
                    onClick={() => {
                      if (confirm(`Remove ${p.name}? Their link stops earning.`)) void patch(p.id, { status: "removed" });
                    }}
                  >
                    Remove
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
