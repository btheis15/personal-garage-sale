import Link from "next/link";
import { ViewTransition } from "react";
import { availability } from "@/lib/availability";
import { conditionLabel, money } from "@/lib/site";
import type { PublicItem } from "@/lib/types";
import { ItemPhoto } from "./ItemPhoto";

/** Shared-element name, so a card's photo morphs into the item page's gallery. */
export const itemVtName = (slug: string) => `item-${slug}`;

export function ItemCard({ item, priority = false, morph = false, index = 0 }: { item: PublicItem; priority?: boolean; morph?: boolean; index?: number }) {
  const state = availability(item);
  const [first, second] = item.photos;
  const photo = (
    <div className="relative aspect-square overflow-hidden rounded-xl bg-kraft shadow-[0_1px_0_rgba(31,42,55,0.04)] transition-shadow duration-500 group-hover:shadow-[0_18px_40px_-18px_rgba(31,42,55,0.5)]">
      <div className={`absolute inset-0 transition duration-[1200ms] ease-soft group-hover:scale-[1.06] ${state === "sold" ? "opacity-60 grayscale" : ""}`}>
        <ItemPhoto url={first?.url} alt={item.title} sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw" priority={priority} />
      </div>
      {second && state !== "sold" && (
        <div className="absolute inset-0 hidden opacity-0 transition-opacity duration-700 group-hover:opacity-100 md:block">
          <ItemPhoto url={second.url} alt="" sizes="(min-width: 1024px) 25vw, 33vw" />
        </div>
      )}
      {state !== "available" ? (
        <span className={`absolute top-2 left-2 z-10 rounded-full px-2.5 py-1 text-xs font-semibold text-white ${state === "sold" ? "bg-ink" : "bg-sky"}`}>{state === "sold" ? "Sold" : "On hold"}</span>
      ) : item.compareAtCents ? (
        <span className="absolute top-2 left-2 z-10 rounded-full bg-amber px-2.5 py-1 text-xs font-semibold text-white">Price drop</span>
      ) : item.priceCents === 0 ? (
        <span className="absolute top-2 left-2 z-10 rounded-full bg-leaf px-2.5 py-1 text-xs font-semibold text-white">Free</span>
      ) : null}
    </div>
  );
  return (
    <Link href={`/item/${item.slug}`} className="group block" data-reveal style={{ "--i": index % 4 } as React.CSSProperties}>
      {morph ? (
        <ViewTransition name={itemVtName(item.slug)} share="morph" default="none">
          {photo}
        </ViewTransition>
      ) : (
        photo
      )}
      <div className="mt-3 px-0.5">
        <p className="text-lg font-semibold">
          {item.priceCents === 0 ? "Free" : money(item.priceCents)}
          {item.compareAtCents && state === "available" && <span className="ml-2 text-sm font-normal text-muted line-through">{money(item.compareAtCents)}</span>}
        </p>
        <h3 className="line-clamp-2 font-sans text-[0.97rem] leading-snug transition-colors group-hover:text-tag">{item.title}</h3>
        <p className="mt-0.5 text-sm text-muted">{[conditionLabel(item.condition), item.size && `Size ${item.size}`, item.ships && "Ships", item.obo && state === "available" && "OBO"].filter(Boolean).join(" · ")}</p>
      </div>
    </Link>
  );
}
