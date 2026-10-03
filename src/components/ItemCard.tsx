import Link from "next/link";
import { availability } from "@/lib/availability";
import { conditionLabel, money } from "@/lib/site";
import type { PublicItem } from "@/lib/types";
import { ItemPhoto } from "./ItemPhoto";

export function ItemCard({ item, priority = false }: { item: PublicItem; priority?: boolean }) {
  const state = availability(item);
  return (
    <Link href={`/item/${item.slug}`} className="group block">
      <div className="relative aspect-square overflow-hidden rounded-lg border border-line bg-kraft">
        <div className={`absolute inset-0 transition duration-300 group-hover:scale-[1.03] ${state === "sold" ? "opacity-60 grayscale" : ""}`}>
          <ItemPhoto url={item.photos[0]?.url} alt={item.title} sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw" priority={priority} />
        </div>
        {state !== "available" && (
          <span className={`absolute top-2 left-2 rounded px-2 py-0.5 text-xs font-bold text-white ${state === "sold" ? "bg-ink" : "bg-sky"}`}>{state === "sold" ? "Sold" : "On hold"}</span>
        )}
        {state === "available" && item.compareAtCents && <span className="absolute top-2 left-2 rounded bg-sun px-2 py-0.5 text-xs font-bold">Price drop</span>}
      </div>
      <p className="mt-2 text-lg font-bold">
        {item.priceCents === 0 ? "Free" : money(item.priceCents)}
        {item.compareAtCents && state === "available" && <span className="ml-2 text-sm font-normal text-muted line-through">{money(item.compareAtCents)}</span>}
      </p>
      <p className="line-clamp-2 leading-snug group-hover:underline">{item.title}</p>
      <p className="text-sm text-muted">
        {[conditionLabel(item.condition), item.size && `Size ${item.size}`, item.ships && "Ships", item.obo && state === "available" && "OBO"].filter(Boolean).join(" · ")}
      </p>
    </Link>
  );
}
