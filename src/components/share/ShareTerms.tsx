/**
 * The "Spread the word" terms: the written agreement between the seller and a friend who shares the
 * sale (Illinois's Freelance Worker Protection Act asks for one: both parties, the work, the pay, and
 * how and when it's paid). Changing them means a new TERMS_VERSION here and PARTNER_TERMS_VERSION in
 * server/src/site.js: the Sell app keeps which version each friend agreed to, and when.
 */
export const TERMS_VERSION = "2026-10";

export function ShareTerms({ ratePercent, seller }: { ratePercent: number | null; seller: { name: string; area: string; email: string } }) {
  const rate = ratePercent ? `${ratePercent}%` : "the rate shown on the sign-up page";
  return (
    <div className="space-y-3 text-sm text-ink/85">
      <p>
        This is the agreement between <b>{seller.name}</b>
        {seller.area ? ` (${seller.area})` : ""}
        {seller.email ? `, ${seller.email}` : ""} (&ldquo;I&rdquo; or &ldquo;me&rdquo;), and you, the person named at sign-up, at the mailing address you
        give (&ldquo;you&rdquo;). Version {TERMS_VERSION}.
      </p>
      <ol className="list-decimal space-y-2 pl-5">
        <li>
          <b>What you do.</b> You share links to my garage sale and the things in it (your link) so people can buy them. You choose when, where and how.
        </li>
        <li>
          <b>What you earn.</b> For each order paid with Bitcoin Cash through your link within 30 days of the visit, you earn {rate} of what the items
          sold for, never including shipping. I may give you a different rate; your page always shows yours. Card, cash, Venmo and pay-at-pickup sales
          don&apos;t earn a commission.
        </li>
        <li>
          <b>How and when you&apos;re paid.</b> In Bitcoin Cash, to the address you give me, when the buyer pays: as part of their payment, or sent by
          me right away, at the rate they paid at. If the payment needs a block to be safe (for example a double-spend warning), it goes after one
          block. If an order is refunded after your commission was paid, that commission (or the refunded share of it) comes off your next ones.
        </li>
        <li>
          <b>Prices are mine.</b> I set prices and your rate. You can&apos;t offer your own discounts, take orders or money yourself, or make promises
          for me (for example about an item&apos;s condition or pickup times).
        </li>
        <li>
          <b>Be upfront.</b> Say clearly that you earn a commission whenever you share your link (for example &ldquo;I get a small cut if you buy with
          Bitcoin Cash&rdquo;). No spam, and nothing untrue about me or my things.
        </li>
        <li>
          <b>Taxes and the yearly limit.</b> You&apos;re responsible for reporting and paying your own taxes on what you earn. If you&apos;re a US
          person, what you earn from me is limited to $1 less than the amount the IRS asks a business to report on a 1099-NEC ($1,999 for 2026) in each
          calendar year. Once you reach it, sales through your link earn nothing more until January 1. One sign-up per person: sign-ups that share an
          email, payout address or mailing address count together.
        </li>
        <li>
          <b>Sanctions.</b> You confirm you don&apos;t live in a country or region under US embargo and aren&apos;t on a US sanctions list. Payout
          addresses are checked against the US sanctions list, and I can&apos;t pay one that&apos;s on it. If that changes, stop sharing and tell me.
        </li>
        <li>
          <b>What you tell me.</b> You confirm what you give at sign-up and later (name, country, mailing address, whether you&apos;re a US person, and
          that you have only one sign-up) is true, and you&apos;ll keep it up to date. I rely on it to pay you and meet my legal duties, and I can&apos;t
          check it. If any of it is false, I may end your link and cancel commissions not yet paid, and you&apos;re responsible for any taxes,
          penalties or costs that result.
        </li>
        <li>
          <b>Independent.</b> You&apos;re helping as an independent person, not my employee or agent. Either of us can end this at any time; I can
          pause or remove your link. I may change these terms; the new version applies to sales after I post it.
        </li>
        <li>
          <b>Your details.</b> I keep your name, email, mailing address, country and payout address only to run this, pay you and meet my tax duties.
        </li>
      </ol>
      <p>This agreement is governed by the laws of Illinois. Your page keeps a link to these terms and the date you agreed.</p>
    </div>
  );
}
