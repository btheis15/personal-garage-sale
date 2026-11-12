"use client";

import Link from "next/link";
import { useState } from "react";
import type { SiteSettings } from "@/lib/types";
import { dollars, sellApi, toCents } from "./api";
import { PhoneNotifications } from "./PhoneNotifications";
import { ReceiptsSetup } from "./ReceiptsSetup";

type Setup = {
  server: boolean;
  stripe: "test" | "live" | null;
  stripeWebhook: boolean;
  bch: boolean;
  bchFirstAddress: string | null;
  /** CashTokens extras (wallet receipts, Spread the word): BCH_CASHTOKENS=on in the mini's .env. */
  cashTokens: boolean;
  hotWallet: boolean;
  receipts: boolean;
  walletConnect: boolean;
  email: boolean;
  /** Which Shippo key live shipping uses right now (follows Stripe's test/live mode). */
  shippo?: { mode: "test" | "live"; connected: boolean } | null;
  publicUrl: string | null;
  website: { state: string; message: string } | null;
  siteUrl: string;
};

const SHIP_FROM_DEFAULTS = { name: "", street1: "", street2: "", city: "", state: "", zip: "", phone: "", email: "" };
const PACKAGE_DEFAULTS = { lengthIn: 12, widthIn: 9, heightIn: 4, weightOz: 16 };
const PARTNER_DEFAULTS = { enabled: false, ratePercent: 10, taxFormOver: 2000 };

export function SettingsForm({ initial, setup }: { initial: SiteSettings; setup: Setup }) {
  const [s, setS] = useState(initial);
  const partners = s.partners ?? PARTNER_DEFAULTS;
  const setPartners = (p: Partial<typeof partners>) => setS((x) => ({ ...x, partners: { ...(x.partners ?? PARTNER_DEFAULTS), ...p } }));
  const shipFrom = { ...SHIP_FROM_DEFAULTS, ...(s.shipFrom ?? {}) };
  const setShipFrom = (p: Partial<typeof shipFrom>) => setS((x) => ({ ...x, shipFrom: { ...SHIP_FROM_DEFAULTS, ...(x.shipFrom ?? {}), ...p } }));
  const pack = { ...PACKAGE_DEFAULTS, ...(s.package ?? {}) };
  // Typed as text so a half-typed number doesn't jump around; sent as numbers on save.
  const [packText, setPackText] = useState({ lengthIn: String(pack.lengthIn), widthIn: String(pack.widthIn), heightIn: String(pack.heightIn), weightOz: String(pack.weightOz) });
  const [shipping, setShipping] = useState(dollars(initial.defaultShippingCents));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const text = (k: keyof SiteSettings) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setS((x) => ({ ...x, [k]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const { settings } = await sellApi<{ settings: SiteSettings }>("PUT", "/api/sell/settings", {
        ...s,
        defaultShippingCents: toCents(shipping) ?? 0,
        package: { lengthIn: Number(packText.lengthIn), widthIn: Number(packText.widthIn), heightIn: Number(packText.heightIn), weightOz: Number(packText.weightOz) },
      });
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
    ...(setup.cashTokens
      ? [{ ok: setup.hotWallet, label: "BCH hot wallet (optional)", hint: "For wallet receipts and Spread the word payouts: npm run new-hot-wallet on the mini, BCH_HOT_WALLET_WIF in its .env, then send it about 0.001 BCH." }]
      : [{ ok: false, label: "CashTokens extras (later)", hint: "Wallet receipts and Spread the word, for Bitcoin Cash buyers. Off for now; Bitcoin Cash payments work without them. To add: BCH_CASHTOKENS=on in the mini's .env (docs/MAC_MINI.md)." }]),
    { ok: setup.walletConnect, label: "BCH “Connect wallet” (optional)", hint: "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID in Vercel, from dashboard.reown.com." },
    { ok: setup.email, label: "Order emails (optional)", hint: "SMTP_USER (your iCloud address) and SMTP_PASS (an app-specific password from account.apple.com) in the mini's .env." },
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

        {s.shipping && (
          <div className="space-y-3 rounded-2xl border border-line bg-white p-4">
            <label className="flex items-center justify-between gap-3 font-bold">
              <span>
                Live shipping prices and labels
                <span className="block text-sm font-normal text-muted">Buyers pick a real USPS/UPS price at checkout, and the label is bought for you once they pay. Off: the flat prices above.</span>
              </span>
              <input type="checkbox" checked={Boolean(s.liveShipping)} onChange={(e) => setS((x) => ({ ...x, liveShipping: e.target.checked }))} className="size-5 shrink-0 accent-tag" />
            </label>
            {setup.shippo && (
              <p className={`rounded-xl p-3 text-sm ${setup.shippo.connected ? "bg-leaf-light text-leaf" : "bg-sun"}`}>
                {setup.shippo.mode === "test"
                  ? `Stripe is in test mode, so this uses the Shippo test key (free sample labels, no real postage).${setup.shippo.connected ? "" : " It isn't set yet: SHIPPO_TEST_KEY in the mini's .env."}`
                  : `Stripe is live, so this uses the live Shippo key (real postage).${setup.shippo.connected ? "" : " It isn't set yet: SHIPPO_API_KEY in the mini's .env."}`}
                {s.liveShipping && setup.shippo.connected && !(shipFrom.name && shipFrom.street1 && shipFrom.city && shipFrom.state && shipFrom.zip && shipFrom.phone && shipFrom.email) && " Fill in every ship-from field below (phone and email too) or buyers will see the flat price."}
              </p>
            )}
            <p className="eyebrow">Ship from</p>
            <Field label="Name">
              <input value={shipFrom.name} onChange={(e) => setShipFrom({ name: e.target.value })} className="field" autoComplete="off" />
            </Field>
            <Field label="Street address">
              <input value={shipFrom.street1} onChange={(e) => setShipFrom({ street1: e.target.value })} className="field" autoComplete="off" />
            </Field>
            <Field label="Apt, suite (optional)">
              <input value={shipFrom.street2} onChange={(e) => setShipFrom({ street2: e.target.value })} className="field" autoComplete="off" />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="City">
                <input value={shipFrom.city} onChange={(e) => setShipFrom({ city: e.target.value })} className="field" autoComplete="off" />
              </Field>
              <Field label="State">
                <input value={shipFrom.state} onChange={(e) => setShipFrom({ state: e.target.value.toUpperCase().slice(0, 2) })} placeholder="WI" className="field" autoComplete="off" />
              </Field>
              <Field label="ZIP">
                <input inputMode="numeric" value={shipFrom.zip} onChange={(e) => setShipFrom({ zip: e.target.value })} className="field" autoComplete="off" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone (needed by USPS)">
                <input type="tel" value={shipFrom.phone} onChange={(e) => setShipFrom({ phone: e.target.value })} className="field" autoComplete="off" />
              </Field>
              <Field label="Email (needed by USPS)">
                <input type="email" value={shipFrom.email} onChange={(e) => setShipFrom({ email: e.target.value })} className="field" autoComplete="off" />
              </Field>
            </div>
            <p className="eyebrow">Usual box (for items without their own)</p>
            <div className="grid grid-cols-4 gap-2">
              {([["lengthIn", "Length in"], ["widthIn", "Width in"], ["heightIn", "Height in"], ["weightOz", "Weight oz"]] as const).map(([k, label]) => (
                <Field key={k} label={label}>
                  <input inputMode="decimal" value={packText[k]} onChange={(e) => setPackText((p) => ({ ...p, [k]: e.target.value }))} className="field" />
                </Field>
              ))}
            </div>
          </div>
        )}

        {setup.bch && setup.cashTokens && (
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

      <PhoneNotifications />

      {setup.bch && setup.cashTokens && <ReceiptsSetup hotWallet={setup.hotWallet} />}

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
