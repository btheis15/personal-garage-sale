"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ItemPhoto } from "../ItemPhoto";
import { CopyLink } from "./CopyLink";
import { type Commission, day, type MyPage, post, saveCode, savedKey, saveKey, usd } from "./shared";

const STATE: Record<Commission["state"], [string, string]> = {
  pending: ["On its way", "bg-sun text-ink"],
  sent: ["Paid", "bg-leaf-light text-leaf"],
  cancelled: ["Cancelled", "bg-line text-muted"],
};

export type ShareItem = { slug: string; title: string; photo: string | null; sold: boolean };

/** A friend's own page, opened with their key (#key=… from their link, or kept on this device). */
export function SharePage({ items, contact }: { items: ShareItem[]; contact: string }) {
  const router = useRouter();
  const [key, setKey] = useState<string | null>(null);
  const [data, setData] = useState<MyPage | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async (k: string) => {
    const r = await post<MyPage>("/api/partners/me", { key: k });
    if (r.ok) {
      setData(r.data);
      // Item pages on this device offer them their link for each item.
      saveCode(r.data.partner.code);
      setError("");
    } else {
      if (r.status === 401) {
        saveKey(null);
        saveCode(null);
      }
      setError(r.error);
    }
  }, []);

  useEffect(() => {
    const fromLink = new URLSearchParams(window.location.hash.slice(1)).get("key");
    if (fromLink) {
      saveKey(fromLink);
      // Out of the address bar, so it isn't shared by accident (it's kept on this device instead).
      history.replaceState(null, "", window.location.pathname);
    }
    const k = fromLink ?? savedKey();
    // After this render (state from outside React: the address and this device's storage).
    queueMicrotask(() => {
      if (!k) return setError("Open your page from the link you got when you signed up.");
      setKey(k);
      void load(k);
    });
  }, [load]);

  if (error && !data)
    return (
      <div className="animate-rise rounded-2xl border border-line bg-white p-8 text-center">
        <p className="font-display text-3xl">Your page</p>
        <p className="mt-2 text-muted">{error}</p>
        <p className="mt-2 text-muted">Lost it? {contact ? `Get in touch (${contact}) and I'll send you a new one.` : "Get in touch and I'll send you a new one."}</p>
        <Link href="/share" className="btn btn-outline mt-6">
          About Spread the word
        </Link>
      </div>
    );
  if (!data || !key)
    return (
      <p className="flex items-center gap-2 text-muted">
        <span className="pulse-dot size-2 rounded-full bg-amber" /> Loading your page…
      </p>
    );

  const { partner: p, totals: t } = data;
  const origin = p.link.replace(/\/\?s=.*$/, "");
  return (
    <div>
      <p className="eyebrow text-tag">Spread the word</p>
      <h1 className="animate-rise mt-1 text-4xl md:text-5xl">Hi, {p.name.split(" ")[0]}!</h1>
      {p.status !== "active" && <p className="mt-3 rounded-xl bg-sun p-3 text-sm">Your link is paused for now. Get in touch if you have questions.</p>}
      {!data.open && <p className="mt-3 rounded-xl bg-sun p-3 text-sm">Spread the word is closed for now: sales through your link don&apos;t earn anything until it reopens.</p>}

      <section className="mt-8 rounded-2xl border border-line bg-white p-5 md:p-6" data-reveal>
        <p className="font-bold">Your link</p>
        <p className="mt-1 text-sm text-muted">
          To the whole sale. Bitcoin Cash sales through it (within 30 days of the visit) earn you {p.ratePercent}% of the items, sent to you the moment
          the buyer pays.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <code className="flex min-h-12 flex-1 items-center rounded-lg border border-line bg-kraft px-4 py-2 text-sm break-all">{p.link}</code>
          <CopyLink text={p.link} share="Garage sale" />
        </div>
      </section>

      {items.length > 0 && (
        <section className="mt-4 rounded-2xl border border-line bg-white p-5 md:p-6" data-reveal>
          <p className="font-bold">Share one item</p>
          <p className="mt-1 text-sm text-muted">Know someone who needs a bike or a crib? Each link opens that item and still counts for you.</p>
          <ul className="mt-3 max-h-[28rem] divide-y divide-line overflow-y-auto">
            {items.map((x) => (
              <li key={x.slug} className="flex items-center gap-3 py-2.5">
                <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-kraft">{x.photo && <ItemPhoto url={x.photo} alt="" sizes="48px" />}</div>
                <Link href={`/item/${x.slug}`} className="min-w-0 flex-1 truncate text-sm hover:underline">
                  {x.title}
                  {x.sold && <span className="text-muted"> · sold</span>}
                </Link>
                <CopyLink text={`${origin}/item/${x.slug}?s=${p.code}`} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-4 grid grid-cols-3 gap-3">
        {[
          ["Sales", String(t.sales)],
          ["Paid to you", usd(t.paidCents)],
          ["On its way", usd(t.waitingCents)],
        ].map(([label, value], i) => (
          <div key={label} className="rounded-2xl border border-line bg-white p-4" data-reveal style={{ "--i": i } as React.CSSProperties}>
            <p className="eyebrow text-muted">{label}</p>
            <p className="mt-1 font-display text-2xl md:text-3xl">{value}</p>
          </div>
        ))}
      </div>
      {data.limit && (
        <p className="mt-3 text-sm text-muted">
          This year: {usd(data.limit.earnedCents)} of your {usd(data.limit.limitCents)} yearly limit
          {data.limit.reached ? ". Your link earns again from January 1." : ` (${usd(data.limit.leftCents)} left).`}
        </p>
      )}

      <section className="mt-8">
        <h2 className="text-2xl">What you&apos;ve earned</h2>
        {data.commissions.length ? (
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-white">
            {data.commissions.map((c) => (
              <li key={`${c.order}-${c.at}`} className="flex flex-wrap items-start justify-between gap-2 p-4">
                <div>
                  <p className="font-bold">
                    {usd(c.cents ?? 0)}{" "}
                    {c.baseCents != null && (
                      <span className="text-sm font-normal text-muted">
                        ({c.ratePercent}% of {usd(c.baseCents)})
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-muted">
                    Order #{c.order} · {day(c.at)}
                  </p>
                  {c.state === "sent" && <p className="text-sm text-muted">{c.how === "split" ? "Paid in the buyer's own payment" : "Sent to you when the buyer paid"}</p>}
                  {c.note && <p className="text-sm text-muted">{c.note}</p>}
                </div>
                <div className="text-right text-sm">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${STATE[c.state][1]}`}>{STATE[c.state][0]}</span>
                  {c.txUrl && (
                    <p className="mt-1">
                      <a href={c.txUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                        {c.bch} BCH ↗
                      </a>
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-muted">Nothing yet. Sales show up here as soon as someone pays through your link.</p>
        )}
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-2">
        <EditCard
          title="Payout address"
          hint="The Bitcoin Cash address your cut is sent to."
          value={p.address}
          field="address"
          mono
          pageKey={key}
          onSaved={setData}
        />
        <EditCard title="Email" hint="Optional: so I can reach you about your link." value={p.email ?? ""} field="email" type="email" pageKey={key} onSaved={setData} />
      </section>

      <p className="mt-8 text-sm text-muted">
        {p.termsAcceptedAt && (
          <>
            You agreed to the{" "}
            <Link href="/share/terms" className="underline underline-offset-4">
              terms
            </Link>{" "}
            (version {p.termsVersion}) on {day(p.termsAcceptedAt)}. Your taxes on what you earn are up to you.{" "}
          </>
        )}
        <button
          type="button"
          className="underline underline-offset-4"
          onClick={() => {
            saveKey(null);
            saveCode(null);
            router.push("/share");
          }}
        >
          Sign out on this device
        </button>
      </p>
    </div>
  );
}

function EditCard({
  title,
  hint,
  value,
  field,
  type = "text",
  mono = false,
  pageKey,
  onSaved,
}: {
  title: string;
  hint: string;
  value: string;
  field: "address" | "email";
  type?: string;
  mono?: boolean;
  pageKey: string;
  onSaved: (d: MyPage) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="rounded-2xl border border-line bg-white p-5" data-reveal>
      <p className="font-bold">{title}</p>
      <p className="mt-1 text-sm text-muted">{hint}</p>
      {editing ? (
        <form
          className="mt-3 space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const r = await post<MyPage>(`/api/partners/me/${field}`, { key: pageKey, [field]: new FormData(e.currentTarget).get(field) });
            setBusy(false);
            if (r.ok) {
              onSaved(r.data);
              setEditing(false);
            } else setError(r.errors?.[field] ?? r.error);
          }}
        >
          <input name={field} type={type} defaultValue={value} spellCheck={false} autoComplete="off" className={`field ${mono ? "font-mono text-sm" : ""}`} />
          {error && (
            <p role="alert" className="text-sm font-bold text-berry">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
            <button type="button" className="btn btn-outline" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-3 flex items-center gap-3">
          <p className={`min-w-0 flex-1 break-all ${mono ? "font-mono text-sm" : ""}`}>{value || <span className="text-muted">None</span>}</p>
          <button type="button" className="btn btn-outline shrink-0" onClick={() => setEditing(true)}>
            Change
          </button>
        </div>
      )}
    </div>
  );
}

