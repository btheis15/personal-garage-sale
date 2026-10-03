import Link from "next/link";
import { availability } from "@/lib/availability";
import { conditionLabel, money } from "@/lib/site";
import type { PublicItem } from "@/lib/types";
import { ItemPhoto } from "./ItemPhoto";

export function ItemCard({ item, priority = false }: { item: PublicItem; priority?: boolean }) {
  const state = availability(item);
  return (
    <Link href={`/item/${item.slug}`} className="group block">
      <div className="relative aspect-square overflow-hidden rounded-2xl bg-kraft">
        <div className={`absolute inset-0 transition duration-500 ease-soft group-hover:scale-[1.04] ${state === "sold" ? "opacity-60 grayscale" : ""}`}>
          <ItemPhoto url={item.photos[0]?.url} alt={item.title} sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw" priority={priority} />
        </div>
        <div className="absolute bottom-2 left-2 flex flex-wrap gap-1">
          {state === "available" ? (
            <span className="price-tag text-sm shadow-sm">{item.priceCents === 0 ? "FREE" : money(item.priceCents)}</span>
          ) : (
            <span className={`rounded-md px-2 py-0.5 text-sm font-bold text-white ${state === "sold" ? "bg-ink" : "bg-sky"}`}>{state === "sold" ? "Sold" : "On hold"}</span>
          )}
        </div>
        {state === "available" && item.compareAtCents && (
          <span className="absolute top-2 left-2 rounded-md bg-sun px-2 py-0.5 text-xs font-bold">Price drop</span>
        )}
      </div>
      <p className="mt-2 line-clamp-2 leading-snug font-bold">{item.title}</p>
      <p className="text-sm text-muted">
        {conditionLabel(item.condition)}
        {item.ships ? " · Ships" : ""}
        {item.obo && state === "available" ? " · OBO" : ""}
      </p>
    </Link>
  );
}
