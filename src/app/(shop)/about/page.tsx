import type { Metadata } from "next";
import { getSettings } from "@/lib/shop";

export const metadata: Metadata = { title: "Pickup, payment & questions" };

export default async function AboutPage() {
  const s = await getSettings();
  const faq = [
    { q: "Where do I pick things up?", a: `${s.pickupArea}. Once you've paid (or put something on hold), I'll send the address and we'll find a time.` },
    {
      q: "How can I pay?",
      a: `Online with a card, Apple Pay or Google Pay (through Stripe, so I never see your card), or with Bitcoin Cash straight from your wallet.${s.payAtPickup ? ` Or put it on hold for ${s.payAtPickupHours} hours and pay at pickup with cash${s.venmo ? ` or Venmo (${s.venmo})` : ""}.` : ""}`,
    },
    { q: "Is the price firm?", a: "Items marked \"or best offer\" are open to offers: send me a message. Everything else is priced to sell." },
    { q: "Can you ship it?", a: s.shipping ? "Items that say \"Ships\" can be shipped within the US; the price is shown on the item. Everything else is pickup only." : "Everything is pickup only for now." },
    { q: "Can I return something?", a: "These are used things sold as is, so all sales are final. If something isn't as described, tell me at pickup and we'll sort it out." },
  ];
  return (
    <div className="container-page max-w-3xl py-10">
      <h1 className="animate-rise text-4xl md:text-5xl">Pickup, payment & questions</h1>
      <p className="mt-4 text-lg whitespace-pre-line text-muted">{s.about}</p>
      <dl className="mt-10 space-y-4">
        {faq.map((f) => (
          <div key={f.q} className="rounded-2xl border border-line bg-white p-5" data-reveal>
            <dt className="text-lg font-bold">{f.q}</dt>
            <dd className="mt-1 text-ink/85">{f.a}</dd>
          </div>
        ))}
      </dl>
      {(s.contactEmail || s.contactPhone) && (
        <div className="mt-10 rounded-lg bg-kraft p-6">
          <h2 className="text-2xl">Questions?</h2>
          <p className="mt-2">
            {s.contactPhone && (
              <>
                Text me at{" "}
                <a href={`sms:${s.contactPhone.replace(/[^\d+]/g, "")}`} className="font-bold underline">
                  {s.contactPhone}
                </a>
                {s.contactEmail ? " or email " : "."}
              </>
            )}
            {s.contactEmail && (
              <a href={`mailto:${s.contactEmail}`} className="font-bold underline">
                {s.contactEmail}
              </a>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
