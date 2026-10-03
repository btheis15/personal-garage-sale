"use client";

import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { availability } from "@/lib/availability";
import type { PublicItem } from "@/lib/types";
import { cart, useCart } from "./cart/store";

const subscribeNow = (cb: () => void) => {
  const t = setInterval(cb, 30_000);
  return () => clearInterval(t);
};

export function BuyButtons({ item }: { item: PublicItem }) {
  const router = useRouter();
  const { items } = useCart();
  // Worked out again in the browser, so a hold that just ran out shows as available.
  const now = useSyncExternalStore(subscribeNow, () => Math.floor(Date.now() / 30_000), () => 0);
  const state = now ? availability(item, now * 30_000) : availability(item);
  const inCart = items.some((i) => i.id === item.id);

  if (state === "sold") return <p className="rounded-lg bg-kraft px-4 py-3 text-center font-bold">Sold, sorry! Have a look at what else is for sale.</p>;
  if (state === "on_hold")
    return (
      <p className="rounded-lg bg-tag-light px-4 py-3 text-center font-semibold text-tag">
        On hold: someone is paying for it right now. If they don&apos;t, it&apos;s back shortly.
      </p>
    );

  const add = () =>
    cart.add({
      id: item.id,
      slug: item.slug,
      title: item.title,
      priceCents: item.priceCents,
      photo: item.photos[0]?.url,
      maxQty: Math.max(1, item.quantity),
      ships: item.ships,
      pickup: item.pickup,
      shippingEstimate: item.shippingCents ?? undefined,
    });

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => {
          if (!inCart) add();
          cart.close();
          router.push("/checkout");
        }}
      >
        Buy it now
      </button>
      <button type="button" className="btn btn-outline" onClick={() => (inCart ? cart.open() : add())}>
        {inCart ? "In your cart ✓" : "Add to cart"}
      </button>
    </div>
  );
}
