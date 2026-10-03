"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BagIcon, SearchIcon } from "./icons";
import { cart, useCart } from "./cart/store";

export function Header({ name }: { name: string }) {
  const { count } = useCart();
  const path = usePathname();
  const nav = [
    { href: "/shop", label: "Shop" },
    { href: "/about", label: "Pickup & info" },
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur supports-[backdrop-filter]:bg-paper/75">
      <div className="container-page flex h-16 items-center gap-3">
        <Link href="/" className="flex min-w-0 items-center gap-2 text-lg font-bold tracking-tight md:text-xl">
          <Image src="/icon.png" alt="" width={36} height={36} className="hover-wiggle size-9 shrink-0 rounded-lg" priority />
          <span className="truncate">{name}</span>
        </Link>
        <nav className="ml-auto hidden items-center gap-1 sm:flex">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className={`rounded-lg px-3 py-2 font-bold transition hover:bg-kraft ${path.startsWith(n.href) ? "text-tag-dark" : ""}`}>
              {n.label}
            </Link>
          ))}
        </nav>
        <Link href="/shop?focus=search" className="ml-auto grid size-11 place-items-center rounded-lg hover:bg-kraft sm:ml-0" aria-label="Search">
          <SearchIcon />
        </Link>
        <button type="button" onClick={() => cart.open()} className="relative grid size-11 place-items-center rounded-lg hover:bg-kraft" aria-label={`Cart, ${count} ${count === 1 ? "item" : "items"}`}>
          <BagIcon />
          {count > 0 && (
            <span key={count} className="animate-pop absolute top-1 right-0.5 grid min-w-5 place-items-center rounded-full bg-tag px-1 text-xs font-bold text-white">
              {count}
            </span>
          )}
        </button>
      </div>
      <nav className="container-page flex gap-1 pb-2 sm:hidden">
        {nav.map((n) => (
          <Link key={n.href} href={n.href} className={`rounded-full px-3 py-1 text-sm font-bold ${path.startsWith(n.href) ? "bg-ink text-paper" : "bg-kraft"}`}>
            {n.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
