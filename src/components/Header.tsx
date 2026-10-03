"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cart, useCart } from "./cart/store";
import { BagIcon, CloseIcon, MenuIcon, SearchIcon } from "./icons";
import { Starburst } from "./ornaments";

type Category = { value: string; label: string; count: number };

export function Header({ name, categories }: { name: string; categories: Category[] }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { count } = useCart();
  const pathname = usePathname();
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);

  // Close the menu and search when the page changes.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setMenuOpen(false);
    setSearchOpen(false);
  }
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);
  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  const underline = "absolute inset-x-0 bottom-5 h-0.5 origin-left scale-x-0 rounded-full bg-amber transition-transform duration-300";

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/80">
      <div className="container-page flex h-16 items-center justify-between gap-2 md:h-20">
        <div className="flex flex-1 items-center md:hidden">
          <button type="button" className="-ml-2 grid size-11 place-items-center" aria-label="Open menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
            <MenuIcon />
          </button>
        </div>

        <Link href="/" className="group flex items-center gap-2.5" aria-label={`${name}, home`}>
          <Image src="/icon.png" alt="" width={44} height={44} priority className="size-9 rounded-xl transition-transform duration-700 ease-soft group-hover:-rotate-6 group-hover:scale-105 md:size-11" />
          <span className="font-display text-[1.15rem] leading-none whitespace-nowrap sm:text-xl md:text-2xl">{name}</span>
        </Link>

        <nav aria-label="Main" className="hidden flex-1 justify-center gap-8 md:flex">
          {/* Shop: a panel drops down on hover or keyboard focus. */}
          <div className="group/mega flex items-center">
            <Link href="/shop" aria-haspopup="true" className={`relative py-7 font-medium transition-colors hover:text-tag ${pathname.startsWith("/shop") ? "text-tag" : ""}`}>
              Shop
              <span className={`${underline} group-hover/mega:scale-x-100`} />
            </Link>
            <div className="invisible absolute inset-x-0 top-full -translate-y-2 border-b border-line bg-paper opacity-0 shadow-[0_24px_48px_-24px_rgba(31,42,55,0.35)] transition duration-300 ease-soft group-focus-within/mega:visible group-focus-within/mega:translate-y-0 group-focus-within/mega:opacity-100 group-hover/mega:visible group-hover/mega:translate-y-0 group-hover/mega:opacity-100">
              <div className="container-page grid grid-cols-[2fr_1fr] gap-10 py-10">
                <div>
                  <p className="eyebrow mb-4">Kinds of things</p>
                  <ul className="grid grid-cols-3 gap-x-8 gap-y-1">
                    <li>
                      <Link href="/shop" className="flex items-baseline justify-between gap-3 border-b border-line/70 py-2.5 hover:text-tag">
                        Everything
                      </Link>
                    </li>
                    {categories.map((c) => (
                      <li key={c.value}>
                        <Link href={`/shop?category=${c.value}`} className="flex items-baseline justify-between gap-3 border-b border-line/70 py-2.5 hover:text-tag">
                          {c.label}
                          <span className="text-sm text-muted">{c.count}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
                <Link href="/shop" className="group/card relative isolate flex flex-col justify-end overflow-hidden rounded-2xl bg-tag-dark p-7 text-paper">
                  <Starburst className="absolute -top-8 -right-8 -z-10 size-40 text-xs opacity-90" text="Just listed" />
                  <p className="eyebrow text-amber-light">New this week</p>
                  <p className="font-display text-3xl">Just listed</p>
                  <span className="mt-3 inline-flex items-center gap-2 text-sm text-amber-light">
                    See the latest <span className="transition-transform group-hover/card:translate-x-1">→</span>
                  </span>
                </Link>
              </div>
            </div>
          </div>
          <Link href="/about" className={`group/link relative py-7 font-medium transition-colors hover:text-tag ${pathname === "/about" ? "text-tag" : ""}`}>
            About & pickup
            <span className={`${underline} group-hover/link:scale-x-100`} />
          </Link>
        </nav>

        <div className="flex flex-1 items-center justify-end gap-1 md:flex-none">
          <button type="button" className="grid size-11 place-items-center rounded-full transition hover:bg-kraft" aria-label="Search" onClick={() => setSearchOpen((v) => !v)}>
            <SearchIcon />
          </button>
          <button type="button" className="relative -mr-2 grid size-11 place-items-center rounded-full transition hover:bg-kraft" aria-label={`Cart, ${count} ${count === 1 ? "item" : "items"}`} onClick={() => cart.open()}>
            <BagIcon />
            {count > 0 && (
              <span key={count} className="animate-bump absolute top-1.5 right-1 grid min-w-5 place-items-center rounded-full bg-amber px-1 text-[0.7rem] leading-5 font-bold text-white">
                {count}
              </span>
            )}
          </button>
        </div>
      </div>

      {searchOpen && (
        <form
          role="search"
          className="animate-fade-in container-page pb-4"
          onSubmit={(e) => {
            e.preventDefault();
            const q = new FormData(e.currentTarget).get("q")?.toString().trim();
            router.push(q ? `/shop?q=${encodeURIComponent(q)}` : "/shop");
          }}
        >
          <label className="flex items-center gap-3 rounded-full border border-line bg-white px-4">
            <SearchIcon size={18} className="text-muted" />
            <input ref={searchRef} name="q" type="search" placeholder="Search: lamp, bike, Lego…" className="h-12 w-full bg-transparent text-base outline-none" aria-label="Search" />
          </label>
        </form>
      )}

      {/* The menu on a phone: slides in, its links following one after another. */}
      <div className={`fixed inset-0 z-50 md:hidden ${menuOpen ? "" : "pointer-events-none"}`} aria-hidden={!menuOpen}>
        <div className={`absolute inset-0 bg-ink/40 transition-opacity duration-300 ${menuOpen ? "opacity-100" : "opacity-0"}`} onClick={() => setMenuOpen(false)} />
        <nav aria-label="Mobile" className={`absolute inset-y-0 left-0 flex w-[85%] max-w-sm flex-col bg-paper shadow-xl transition-transform duration-300 ease-soft ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}>
          <div className="flex h-16 items-center justify-between border-b border-line px-4">
            <span className="font-display text-2xl">Menu</span>
            <button type="button" className="-mr-2 grid size-11 place-items-center" aria-label="Close menu" onClick={() => setMenuOpen(false)} tabIndex={menuOpen ? 0 : -1}>
              <CloseIcon />
            </button>
          </div>
          <ul className="flex-1 overflow-y-auto px-4 py-2">
            {[{ href: "/shop", label: "Everything for sale", count: null as number | null }, ...categories.map((c) => ({ href: `/shop?category=${c.value}`, label: c.label, count: c.count as number | null }))].map((item, i) => (
              <li key={item.href} style={{ transitionDelay: menuOpen ? `${120 + i * 45}ms` : "0ms" }} className={`transition duration-500 ease-soft ${menuOpen ? "translate-x-0 opacity-100" : "-translate-x-4 opacity-0"}`}>
                <Link href={item.href} tabIndex={menuOpen ? 0 : -1} className="flex h-13 items-center justify-between border-b border-line py-3 font-display text-xl">
                  {item.label}
                  {item.count !== null && <span className="font-sans text-sm text-muted">{item.count}</span>}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/about" tabIndex={menuOpen ? 0 : -1} className="flex h-12 items-center">
                About & pickup
              </Link>
            </li>
          </ul>
          <div className="relative m-4 overflow-hidden rounded-2xl bg-tag-dark p-5 text-paper">
            <Starburst className="absolute -top-6 -right-6 size-24 text-[0.6rem]" />
            <p className="font-display text-xl">Questions?</p>
            <Link href="/about" tabIndex={menuOpen ? 0 : -1} className="mt-1 inline-block text-sm text-amber-light underline">
              How pickup and payment work
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
}
