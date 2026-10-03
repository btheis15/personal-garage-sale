"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/sell", label: "Items", icon: "M4 6h16M4 12h16M4 18h10" },
  { href: "/sell/charge", label: "Ring up", icon: "M3 7h18v12H3zM3 11h18M7 15h3" },
  { href: "/sell/new", label: "Sell", icon: "M12 5v14M5 12h14", big: true },
  { href: "/sell/orders", label: "Orders", icon: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6" },
  { href: "/sell/settings", label: "Settings", icon: "M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM19.4 13a7.6 7.6 0 000-2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 00-1.7-1L15 3.5h-4l-.4 2.5a7.4 7.4 0 00-1.7 1l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 000 2l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 001.7 1l.4 2.5h4l.4-2.5a7.4 7.4 0 001.7-1l2.4 1 2-3.4z" },
];

export function SellNav() {
  const path = usePathname();
  const active = (href: string) => (href === "/sell" ? path === "/sell" || path.startsWith("/sell/items") : path.startsWith(href));
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 print:hidden border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto flex max-w-lg items-end justify-around">
        {TABS.map((t) => (
          <li key={t.href} className="flex-1">
            <Link href={t.href} className={`flex flex-col items-center gap-0.5 py-2 text-[0.7rem] font-bold ${active(t.href) ? "text-tag-dark" : "text-muted"}`}>
              {t.big ? (
                <span className="-mt-6 grid size-14 place-items-center rounded-2xl bg-tag text-white shadow-[0_3px_0_var(--color-tag-dark)]">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                    <path d={t.icon} />
                  </svg>
                </span>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={t.icon} />
                </svg>
              )}
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
