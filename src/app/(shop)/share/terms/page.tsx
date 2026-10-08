import type { Metadata } from "next";
import { ShareTerms } from "@/components/share/ShareTerms";
import { getPayments, getSettings } from "@/lib/shop";

export const metadata: Metadata = { title: "Spread the word: terms" };

export default async function ShareTermsPage() {
  const [s, payments] = await Promise.all([getSettings(), getPayments()]);
  return (
    <div className="container-page max-w-3xl py-10">
      <p className="eyebrow text-tag">Spread the word</p>
      <h1 className="animate-rise mt-1 text-4xl md:text-5xl">The terms</h1>
      <p className="mt-3 text-muted">Plain and short: what you do, what you earn, and how it&apos;s paid.</p>
      <div className="mt-8 rounded-2xl border border-line bg-white p-5 md:p-8">
        <ShareTerms ratePercent={payments.partners?.ratePercent ?? null} seller={{ name: s.name, area: s.pickupArea, email: s.contactEmail }} />
      </div>
    </div>
  );
}
