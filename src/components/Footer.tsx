import Link from "next/link";
import type { SiteSettings } from "@/lib/types";
import { Bunting, HouseLine, SunRings } from "./ornaments";

export function Footer({ settings, sharing = false }: { settings: SiteSettings; sharing?: boolean }) {
  return (
    <footer className="relative isolate mt-24 overflow-hidden bg-tag-dark pt-4 text-paper">
      <Bunting className="relative mx-auto max-w-6xl px-2 text-paper/30" flags={18} />
      <SunRings className="animate-spin-slow pointer-events-none absolute -right-40 -bottom-40 -z-10 size-[30rem] text-amber/15" />
      <div className="container-page py-14">
        <div className="mb-12 flex flex-col gap-6 md:flex-row md:items-end md:justify-between" data-reveal>
          <div>
            <HouseLine className="w-24 text-amber" />
            <p className="mt-4 font-display text-4xl md:text-5xl">{settings.name}</p>
            <p className="mt-2 max-w-md text-paper/70">{settings.tagline}</p>
          </div>
          <Link href="/shop" className="btn btn-light self-start md:self-auto">
            See what&apos;s for sale →
          </Link>
        </div>
        <div className="grid gap-8 border-t border-paper/15 pt-10 text-sm md:grid-cols-3">
          <div className="space-y-2" data-reveal style={{ "--i": 0 } as React.CSSProperties}>
            <p className="eyebrow text-amber-light">Buying</p>
            <p>
              <Link href="/shop" className="hover:text-amber-light">
                Everything for sale
              </Link>
            </p>
            <p>
              <Link href="/about" className="hover:text-amber-light">
                Pickup, payment & questions
              </Link>
            </p>
            {sharing && (
              <p>
                <Link href="/share" className="hover:text-amber-light">
                  Spread the word (earn a cut)
                </Link>
              </p>
            )}
          </div>
          <div className="space-y-2" data-reveal style={{ "--i": 1 } as React.CSSProperties}>
            <p className="eyebrow text-amber-light">Pickup</p>
            <p className="text-paper/80">{settings.pickupArea}</p>
          </div>
          <div className="space-y-2" data-reveal style={{ "--i": 2 } as React.CSSProperties}>
            <p className="eyebrow text-amber-light">Get in touch</p>
            {settings.contactEmail && (
              <p>
                <a href={`mailto:${settings.contactEmail}`} className="hover:text-amber-light">
                  {settings.contactEmail}
                </a>
              </p>
            )}
            {settings.contactPhone && (
              <p>
                <a href={`sms:${settings.contactPhone.replace(/[^\d+]/g, "")}`} className="hover:text-amber-light">
                  Text {settings.contactPhone}
                </a>
              </p>
            )}
            <p className="text-paper/70">Cards, Apple Pay, Google Pay and Bitcoin Cash welcome.</p>
          </div>
        </div>
        <p className="mt-12 text-xs text-paper/50">© {new Date().getFullYear()} {settings.name}. Thanks for stopping by.</p>
      </div>
    </footer>
  );
}
