import Link from "next/link";
import type { SiteSettings } from "@/lib/types";

export function Footer({ settings }: { settings: SiteSettings }) {
  return (
    <footer className="mt-20 border-t border-line bg-kraft/60">
      <div className="container-page grid gap-8 py-10 text-sm md:grid-cols-3">
        <div>
          <p className="text-lg font-bold">{settings.name}</p>
          <p className="mt-1 text-muted">{settings.tagline}</p>
        </div>
        <div className="space-y-1">
          <p className="eyebrow mb-2">Buying</p>
          <p>
            <Link href="/shop" className="hover:underline">
              Everything for sale
            </Link>
          </p>
          <p>
            <Link href="/about" className="hover:underline">
              Pickup, payment & questions
            </Link>
          </p>
        </div>
        <div className="space-y-1">
          <p className="eyebrow mb-2">Get in touch</p>
          {settings.contactEmail && (
            <p>
              <a href={`mailto:${settings.contactEmail}`} className="hover:underline">
                {settings.contactEmail}
              </a>
            </p>
          )}
          {settings.contactPhone && (
            <p>
              <a href={`sms:${settings.contactPhone.replace(/[^\d+]/g, "")}`} className="hover:underline">
                Text {settings.contactPhone}
              </a>
            </p>
          )}
          <p className="text-muted">Cards, Apple Pay, Google Pay and Bitcoin Cash accepted.</p>
        </div>
      </div>
    </footer>
  );
}
