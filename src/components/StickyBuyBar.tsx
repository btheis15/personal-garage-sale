"use client";

import { useEffect, useState } from "react";
import { availability } from "@/lib/availability";
import { money } from "@/lib/site";
import type { PublicItem } from "@/lib/types";
import { cart, useCart } from "./cart/store";

/**
 * On a phone, once the main buttons scroll out of sight, a slim bar slides up with the price and
 * "Add to cart", so it's always in thumb's reach (from the Om Threads product page).
 */
export function StickyBuyBar({ item, watchId }: { item: PublicItem; watchId: string }) {
  const [visible, setVisible] = useState(false);
  const { items } = useCart();
  useEffect(() => {
    const el = document.getElementById(watchId);
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, [watchId]);
  if (availability(item) !== "available") return null;
  const inCart = items.some((i) => i.id === item.id);
  return (
    <div
      aria-hidden={!visible}
      inert={!visible}
      className={`fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-line bg-paper/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur transition-transform duration-300 ease-soft md:hidden ${visible ? "translate-y-0" : "translate-y-full"}`}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{item.title}</p>
        <p className="font-display text-xl font-semibold text-tag">{item.priceCents === 0 ? "Free" : money(item.priceCents)}</p>
      </div>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() =>
          inCart
            ? cart.open()
            : cart.add({ id: item.id, slug: item.slug, title: item.title, priceCents: item.priceCents, photo: item.photos[0]?.url, maxQty: Math.max(1, item.quantity), ships: item.ships, pickup: item.pickup, shippingEstimate: item.shippingCents ?? undefined })
        }
      >
        {inCart ? "In your cart ✓" : "Add to cart"}
      </button>
    </div>
  );
}
