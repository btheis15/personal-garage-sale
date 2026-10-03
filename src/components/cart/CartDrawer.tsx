"use client";

import Link from "next/link";
import { useEffect } from "react";
import { money } from "@/lib/site";
import { CloseIcon, MinusIcon, PlusIcon } from "../icons";
import { ItemPhoto } from "../ItemPhoto";
import { cart, useCart } from "./store";

export function CartDrawer() {
  const { items, open, subtotal, count } = useCart();

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && cart.close();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const t = open ? 0 : -1;
  return (
    <div className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <div className={`absolute inset-0 bg-ink/40 transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`} onClick={() => cart.close()} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Cart"
        className={`absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-paper shadow-2xl transition-transform duration-300 ease-soft ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex h-16 items-center justify-between border-b border-line px-4 md:px-6">
          <h2 className="text-2xl">Your cart {count > 0 && <span className="text-muted">({count})</span>}</h2>
          <button type="button" className="-mr-2 grid size-11 place-items-center" aria-label="Close cart" onClick={() => cart.close()} tabIndex={t}>
            <CloseIcon />
          </button>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
            <p className="font-display text-3xl">Nothing here yet</p>
            <p className="text-muted">Have a look around: new things go up all the time.</p>
            <Link href="/shop" className="btn btn-primary" onClick={() => cart.close()} tabIndex={t}>
              Browse everything
            </Link>
          </div>
        ) : (
          <>
            <ul className="flex-1 divide-y divide-line overflow-y-auto px-4 md:px-6">
              {items.map((item, i) => (
                <li
                  key={item.id}
                  className="flex gap-4 py-4 transition duration-500 ease-soft"
                  style={{ transitionDelay: open ? `${150 + i * 60}ms` : "0ms", opacity: open ? 1 : 0, transform: open ? "none" : "translateX(16px)" }}
                >
                  <Link href={`/item/${item.slug}`} onClick={() => cart.close()} tabIndex={t} className="relative aspect-square w-20 shrink-0 overflow-hidden rounded-lg bg-kraft">
                    <ItemPhoto url={item.photo} alt={item.title} sizes="80px" />
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex justify-between gap-2">
                      <p className="leading-snug">{item.title}</p>
                      <p className="shrink-0 font-bold">{money(item.priceCents * item.qty)}</p>
                    </div>
                    <p className="text-sm text-muted">{item.ships ? (item.pickup ? "Pickup or shipping" : "Ships") : "Pickup only"}</p>
                    <div className="mt-auto flex items-center justify-between pt-2">
                      {item.maxQty > 1 ? (
                        <div className="flex items-center rounded-full border border-line bg-white">
                          <button type="button" className="grid size-9 place-items-center" aria-label={`One fewer ${item.title}`} onClick={() => cart.setQty(item.id, item.qty - 1)} tabIndex={t}>
                            <MinusIcon size={16} />
                          </button>
                          <span className="w-6 text-center text-sm" aria-live="polite">
                            {item.qty}
                          </span>
                          <button type="button" className="grid size-9 place-items-center disabled:opacity-40" aria-label={`One more ${item.title}`} onClick={() => cart.setQty(item.id, item.qty + 1)} disabled={item.qty >= item.maxQty} tabIndex={t}>
                            <PlusIcon size={16} />
                          </button>
                        </div>
                      ) : (
                        <span className="text-sm text-muted">One of a kind</span>
                      )}
                      <button type="button" className="text-sm text-muted underline underline-offset-4" onClick={() => cart.remove(item.id)} tabIndex={t}>
                        Remove
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="border-t border-line p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:p-6">
              <div className="mb-4 flex justify-between text-lg">
                <span>Subtotal</span>
                <span className="font-bold">{money(subtotal)}</span>
              </div>
              <Link href="/checkout" className="btn btn-primary w-full" onClick={() => cart.close()} tabIndex={t}>
                Check out
              </Link>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
