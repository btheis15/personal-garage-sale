import type { Metadata } from "next";
import Link from "next/link";
import { Bunting, Starburst } from "@/components/ornaments";
import { countryOptions } from "@/components/share/countries";
import { ShareSignup } from "@/components/share/ShareSignup";
import { getPayments, getSettings } from "@/lib/shop";

export const metadata: Metadata = {
  title: "Spread the word",
  description: "Share the garage sale with friends and earn a cut of Bitcoin Cash sales through your link.",
};

export default async function SharePage() {
  const [s, payments] = await Promise.all([getSettings(), getPayments()]);
  const rate = payments.partners?.ratePercent ?? null;
  const steps = [
    ["Get your link", "Sign up below: it takes a minute. You get a link to the whole sale, and one for any item."],
    ["Share it", "Text it to the neighbor who needs a lawnmower, post it in the school group, put it on your story."],
    ["Get your cut", `When someone pays with Bitcoin Cash through your link, ${rate ? `${rate}%` : "your cut"} of the items goes straight to your wallet, right as they pay.`],
  ];
  return (
    <div className="container-page max-w-3xl py-10">
      <div className="relative">
        <Bunting className="text-amber/60" flags={10} />
        <p className="eyebrow mt-6 text-tag">Spread the word</p>
        <h1 className="animate-rise mt-1 text-4xl md:text-6xl">Know someone who&apos;d want this stuff?</h1>
        <p className="mt-4 text-lg text-muted">
          Tell your friends about the sale and earn {rate ? `${rate}%` : "a cut"} of every Bitcoin Cash sale through your link. Same prices for them, a little
          something for you.
        </p>
        {rate && <Starburst className="absolute -top-2 right-0 hidden size-28 md:block" text={`Earn ${rate}%`} />}
      </div>

      <ol className="mt-10 grid gap-4 md:grid-cols-3">
        {steps.map(([title, text], i) => (
          <li key={title} className="rounded-2xl border border-line bg-white p-5" data-reveal style={{ "--i": i } as React.CSSProperties}>
            <span className="grid size-9 place-items-center rounded-full bg-amber font-display text-lg text-white">{i + 1}</span>
            <p className="mt-3 font-bold">{title}</p>
            <p className="mt-1 text-sm text-muted">{text}</p>
          </li>
        ))}
      </ol>

      <section className="mt-12" data-reveal>
        {rate ? (
          <>
            <h2 className="mb-4 text-3xl">Get your link</h2>
            <ShareSignup ratePercent={rate} seller={{ name: s.name, area: s.pickupArea, email: s.contactEmail }} countries={countryOptions()} />
          </>
        ) : (
          <div className="rounded-2xl bg-kraft p-6">
            <p className="text-xl font-bold">Not open right now</p>
            <p className="mt-1 text-muted">Check back soon. In the meantime, sharing the sale is always appreciated!</p>
          </div>
        )}
      </section>

      <div className="mt-10 grid gap-3 text-sm text-muted md:grid-cols-2">
        <p>
          <b className="text-ink">Already signed up?</b>{" "}
          <Link href="/share/me" className="underline underline-offset-4">
            Open your page
          </Link>{" "}
          (on the phone or computer you signed up on, or from your page&apos;s link).
        </p>
        <p>
          <b className="text-ink">The fine print:</b> Bitcoin Cash sales only, paid in BCH. Read{" "}
          <Link href="/share/terms" className="underline underline-offset-4">
            the terms
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
