"use client";

import Link from "next/link";
import { useState } from "react";
import { DoneTick } from "../motion/DoneTick";
import { CopyLink } from "./CopyLink";
import { ShareTerms, TERMS_VERSION } from "./ShareTerms";
import { post, saveCode, saveKey } from "./shared";

type SignedUp = { code: string; name: string; link: string; key: string; pageUrl: string };
type Seller = { name: string; area: string; email: string };

/** The sign-up form, then the friend's link and their page's link. `countries` comes from the server so it hydrates the same. */
export function ShareSignup({ ratePercent, seller, countries }: { ratePercent: number; seller: Seller; countries: { code: string; name: string }[] }) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<SignedUp | null>(null);

  if (done) {
    return (
      <div className="animate-pop rounded-2xl border border-line bg-white p-6 md:p-8" role="status">
        <div className="flex items-center gap-3">
          <DoneTick />
          <p className="font-display text-3xl">Thanks, {done.name.split(" ")[0]}!</p>
        </div>
        <p className="mt-3 text-muted">
          Here&apos;s your link to the whole sale. Text it, post it, put it in the group chat: Bitcoin Cash sales through it earn you {ratePercent}%. On this
          phone or computer, every item&apos;s page now shows your link for that item too.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <code className="flex min-h-12 flex-1 items-center rounded-lg border border-line bg-kraft px-4 py-2 text-sm break-all">{done.link}</code>
          <CopyLink text={done.link} share={seller.name} />
        </div>
        <div className="mt-6 rounded-xl bg-sun/60 p-4">
          <p className="font-bold">Bookmark your page</p>
          <p className="mt-1 text-sm">It shows your sales and what you&apos;ve earned, and it&apos;s where you change your payout address. Keep its link private: it&apos;s your key.</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Link href={`/share/me#key=${done.key}`} className="btn btn-primary">
              Open my page
            </Link>
            <CopyLink text={done.pageUrl} label="Copy page link" />
          </div>
        </div>
      </div>
    );
  }

  const err = (k: string) =>
    errors[k] ? (
      <p className="mt-1 text-sm font-bold text-berry" role="alert">
        {errors[k]}
      </p>
    ) : null;
  return (
    <form
      className="space-y-5 rounded-2xl border border-line bg-white p-5 md:p-8"
      onSubmit={async (e) => {
        e.preventDefault();
        setSending(true);
        setError("");
        setErrors({});
        const f = new FormData(e.currentTarget);
        const r = await post<SignedUp>("/api/partners/signup", {
          name: f.get("name"),
          address: f.get("address"),
          email: f.get("email"),
          country: f.get("country"),
          mailingAddress: f.get("mailingAddress"),
          usPerson: f.get("usPerson"),
          certify: f.get("certify") === "on",
          agree: f.get("agree") === "on",
          termsVersion: TERMS_VERSION,
        });
        setSending(false);
        if (r.ok) {
          saveKey(r.data.key);
          saveCode(r.data.code);
          setDone(r.data);
        } else {
          setError(r.error);
          setErrors(r.errors ?? {});
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-bold">Your name</span>
          <input name="name" required autoComplete="name" className="field" />
          {err("name")}
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-bold">
            Email <span className="font-normal text-muted">(optional)</span>
          </span>
          <input name="email" type="email" autoComplete="email" className="field" />
          {err("email")}
        </label>
      </div>
      <label className="block">
        <span className="mb-1.5 block text-sm font-bold">Your Bitcoin Cash address</span>
        <span className="mb-1.5 block text-sm text-muted">Where your cut is sent. In your wallet, tap Receive and copy the address.</span>
        <input name="address" required autoComplete="off" spellCheck={false} placeholder="bitcoincash:q…" className="field font-mono text-sm" />
        {err("address")}
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-bold">Country you live in</span>
          <select name="country" required defaultValue="" className="field">
            <option value="" disabled>
              Choose…
            </option>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
          {err("country")}
        </label>
        <fieldset>
          <legend className="mb-1.5 block text-sm font-bold">US citizen or US tax resident?</legend>
          <div className="flex h-12 items-center gap-6">
            <label className="flex items-center gap-2">
              <input type="radio" name="usPerson" value="yes" required className="size-4 accent-tag" /> Yes
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="usPerson" value="no" className="size-4 accent-tag" /> No
            </label>
          </div>
          {err("usPerson")}
        </fieldset>
      </div>
      <label className="block">
        <span className="mb-1.5 block text-sm font-bold">Mailing address</span>
        <span className="mb-1.5 block text-sm text-muted">It goes in our agreement. Never shown on the site.</span>
        <textarea name="mailingAddress" required rows={2} autoComplete="street-address" className="field" />
        {err("mailingAddress")}
      </label>

      <details className="rounded-xl border border-line bg-paper p-4">
        <summary className="cursor-pointer font-bold">Read the terms (our agreement)</summary>
        <div className="mt-3">
          <ShareTerms ratePercent={ratePercent} seller={seller} />
        </div>
      </details>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="certify" required className="mt-0.5 size-4 accent-tag" />
        <span>
          What I&apos;ve given is true, this is my only sign-up, I don&apos;t live in a country or region under US embargo, and I&apos;m not on a US sanctions
          list.
        </span>
      </label>
      {err("certify")}
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="agree" required className="mt-0.5 size-4 accent-tag" />
        <span>
          I agree to the{" "}
          <a href="/share/terms" target="_blank" className="font-bold underline underline-offset-4">
            terms
          </a>
          , including that I&apos;ll mention I earn a commission, and that my taxes are up to me.
        </span>
      </label>
      {err("agree")}
      {error && (
        <p role="alert" className="rounded-xl bg-berry/10 p-3 text-sm font-bold text-berry">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary w-full sm:w-auto" disabled={sending}>
        {sending ? "Signing you up…" : "Get my link"}
      </button>
    </form>
  );
}
