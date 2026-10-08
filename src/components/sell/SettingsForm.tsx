"use client";

import Link from "next/link";
import { useState } from "react";
import type { SiteSettings } from "@/lib/types";
import { dollars, sellApi, toCents } from "./api";
import { ReceiptsSetup } from "./ReceiptsSetup";

type Setup = {
  server: boolean;
  stripe: "test" | "live" | null;
  stripeWebhook: boolean;
  bch: boolean;
  bchFirstAddress: string | null;
  hotWallet: boolean;
  receipts: boolean;
  walletConnect: boolean;
  email: boolean;
  publicUrl: string | null;
  website: { state: string; message: string } | null;
  siteUrl: string;
};

const PARTNER_DEFAULTS = { enabled: false, ratePercent: 10, taxFormOver: 2000 };

export function SettingsForm({ initial, setup }: { initial: SiteSettings; setup: Setup }) {
  const [s, setS] = useState(initial);
  const partners = s.partners ?? PARTNER_DEFAULTS;
  const setPartners = (p: Partial<typeof partners>) => setS((x) => ({ ...x, partners: { ...(x.partners ?? PARTNER_DEFAULTS), ...p } }));
  const [shipping, setShipping] = useState(dollars(initial.defaultShippingCents));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const text = (k: keyof SiteSettings) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setS((x) => ({ ...x, [k]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const { settings } = await sellApi<{ settings: SiteSettings }>("PUT", "/api/sell/settings", { ...s, defaultShippingCents: toCents(shipping) ?? 0 });
      setS(settings);
      setMsg({ ok: true, text: "Saved. The shop shows it now." });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    }
    setBusy(false);
  }

  async function signOut() {
    await fetch("/api/sell/logout", { method: "POST" });
    window.location.reload();
  }

  const checks: { ok: boolean; label: string; hint: string }[] = [
    { ok: setup.server, label: "The Mac mini", hint: "SHOP_API_URL, SHOP_API_TOKEN and SHOP_ADMIN_TOKEN in Vercel, and the server running on the mini (docs/MAC_MINI.md)." },
    { ok: Boolean(setup.stripe), label: setup.stripe ? `Stripe: ${setup.stripe === "test" ? "test mode (no real money)" : "live"}` : "Card payments (Stripe)", hint: "STRIPE_SECRET_KEY from your personal Stripe account, in the mini's .env." },
    { ok: setup.stripeWebhook, label: "Stripe's payment notices", hint: `Stripe → Developers → Webhooks → ${setup.publicUrl ?? "<the mini's PUBLIC_URL>"}/stripe/webhook, then STRIPE_WEBHOOK_SECRET in the mini's .env.` },
    { ok: setup.bch, label: setup.bchFirstAddress ? `Bitcoin Cash: first address …${setup.bchFirstAddress.slice(-8)} (check it matches your wallet)` : "Bitcoin Cash", hint: "BCH_XPUB (your wallet's xPub, which can't spend) in the mini's .env." },
    { ok: setup.hotWallet, label: "BCH hot wallet (optional)", hint: "For wallet receipts and Spread the word payouts: npm run new-hot-wallet on the mini, BCH_HOT_WALLET_WIF in its .env, then send it about 0.001 BCH." },
    { ok: setup.walletConnect, label: "BCH “Connect wallet” (optional)", hint: "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID in Vercel, from dashboard.reown.com." },
    { ok: setup.email, label: "Order emails (optional)", hint: "SMTP_USER and SMTP_PASS (a Gmail app password) in the mini's .env." },
  ];

  return (
    <div className="mx-auto max-w-lg px-4 pt-5">
      <h1 className="text-3xl">Settings</h1>
      <form onSubmit={save} className="mt-4 space-y-4">
        <Field label="Shop name">
          <input value={s.name} onChange={text("name")} className="field" required maxLength={60} />
        </Field>
        <Field label="Tagline">
          <input value={s.tagline} onChange={text("tagline")} className="field" maxLength={140} />
        </Field>
        <Field label="Banner across the top (blank for none)">
          <input value={s.announcement} onChange={text("announcement")} placeholder="Garage sale this Saturday, 8 to 2!" className="field" maxLength={140} />
        </Field>
        <Field label="About (home and info pages)">
          <textarea rows={4} value={s.about} onChange={text("about")} className="field" />
        </Field>
        <Field label="Pickup area (shown to everyone: no street address)">
          <input value={s.pickupArea} onChange={text("pickupArea")} placeholder="e.g. North Naperville, IL" className="field" />
        </Field>
        <Field label="Pickup details (only after buying: address, times)">
          <textarea rows={4} value={s.pickupInstructions} onChange={text("pickupInstructions")} className="field" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email">
            <input type="email" value={s.contactEmail} onChange={text("contactEmail")} className="field" />
          </Field>
          <Field label="Phone (for texts)">
            <input type="tel" value={s.contactPhone} onChange={text("contactPhone")} className="field" />
          </Field>
        </div>

        <div className="space-y-3 rounded-2xl border border-line bg-white p-4">
          <label className="flex items-center justify-between gap-3 font-bold">
            Pay at pickup (hold items, pay cash or Venmo)
            <input type="checkbox" checked={s.payAtPickup} onChange={(e) => setS((x) => ({ ...x, payAtPickup: e.target.checked }))} className="size-5 accent-tag" />
          </label>
          {s.payAtPickup && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Hold for (hours)">
                <input inputMode="numeric" value={String(s.payAtPickupHours)} onChange={(e) => setS((x) => ({ ...x, payAtPickupHours: Number(e.target.value.replace(/\D/g, "")) || 0 }))} className="field" />
              </Field>
              <Field label="Venmo">
                <input value={s.venmo} onChange={text("venmo")} placeholder="@your-name" className="field" />
              </Field>
            </div>
          )}
          <label className="flex items-center justify-between gap-3 font-bold">
            Shipping (for items you mark “can ship”)
            <input type="checkbox" checked={s.shipping} onChange={(e) => setS((x) => ({ ...x, shipping: e.target.checked }))} className="size-5 accent-tag" />
          </label>
          {s.shipping && (
            <Field label="Default shipping price ($)">
              <input inputMode="decimal" value={shipping} onChange={(e) => setShipping(e.target.value)} className="field" />
            </Field>
          )}
        </div>

        {setup.bch && (
          <div className="space-y-3 rounded-2xl border border-line bg-white p-4">
            <p className="font-bold">Bitcoin Cash extras</p>
            <Field label="Line printed on wallet receipts">
              <input value={s.receiptNote ?? ""} onChange={text("receiptNote")} placeholder="Thanks for stopping by!" className="field" maxLength={120} />
            </Field>
            <label className="flex items-center justify-between gap-3 font-bold">
              <span>
                Spread the word
                <span className="block text-sm font-normal text-muted">Friends share your sale and earn a cut of Bitcoin Cash sales through their link, paid from the hot wallet.</span>
              </span>
              <input type="checkbox" checked={partners.enabled} onChange={(e) => setPartners({ enabled: e.target.checked })} className="size-5 shrink-0 accent-tag" />
            </label>
            {partners.enabled && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Their cut (%)">
                    <input inputMode="numeric" value={String(partners.ratePercent)} onChange={(e) => setPartners({ ratePercent: Number(e.target.value.replace(/\D/g, "")) || 0 })} className="field" />
                  </Field>
                  <Field label="1099-NEC amount ($)">
                    <input inputMode="numeric" value={String(partners.taxFormOver)} onChange={(e) => setPartners({ taxFormOver: Number(e.target.value.replace(/\D/g, "")) || 0 })} className="field" />
                  </Field>
                </div>
                <p className="text-sm text-muted">
                  A friend in the US earns at most ${Math.max(0, partners.taxFormOver - 1).toLocaleString("en-US")} a year from you, so there&apos;s no 1099 to file. Sign-ups are at{" "}
                  <span className="font-bold">/share</span>.
                </p>
                {!setup.hotWallet && <p className="rounded-xl bg-sun p-3 text-sm">Needs the hot wallet (see Setup below) to pay friends their cut.</p>}
                <Link href="/sell/partners" className="btn btn-outline w-full">
                  See your friends and what they&apos;ve earned →
                </Link>
              </>
            )}
          </div>
        )}

        {msg && <p className={`rounded-xl p-3 text-sm font-bold ${msg.ok ? "bg-leaf-light text-leaf" : "bg-berry/10 text-berry"}`}>{msg.text}</p>}
        <button type="submit" className="btn btn-primary w-full" disabled={busy || !setup.server}>
          {busy ? "Saving…" : "Save"}
        </button>
      </form>

      {setup.bch && <ReceiptsSetup hotWallet={setup.hotWallet} />}

      <section className="mt-10">
        <h2 className="text-xl">Setup</h2>
        <p className="text-sm text-muted">Keys go in the Mac mini&apos;s .env (then restart it), or in Vercel where it says so. docs/MAC_MINI.md walks through each.</p>
        {setup.website && <p className="mt-2 text-sm">Website refresh: {setup.website.message}</p>}
        <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-white">
          {checks.map((c) => (
            <li key={c.label} className="flex gap-3 p-3 text-sm">
              <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-xs font-bold text-white ${c.ok ? "bg-leaf" : "bg-kraft-dark"}`}>{c.ok ? "✓" : ""}</span>
              <span>
                <span className="block font-bold">{c.label}</span>
                {!c.ok && <span className="block text-muted">{c.hint}</span>}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <button type="button" onClick={signOut} className="btn btn-outline mt-8 w-full">
        Sign out
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}
