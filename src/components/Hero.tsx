import Link from "next/link";
import type { PublicItem } from "@/lib/types";
import { money } from "@/lib/site";
import { ItemPhoto } from "./ItemPhoto";
import { Bunting, Starburst, SunRings } from "./ornaments";

const delay = (i: number) => ({ "--i": i }) as React.CSSProperties;

/**
 * The welcome: bunting across the top, the shop's name rising word by word, and a few of the
 * things for sale dropped onto the page like snapshots on a table, swaying a little, with a
 * "sale" sticker turning slowly beside them.
 */
export function Hero({ title, tagline, count, items }: { title: string; tagline: string; count: number; items: PublicItem[] }) {
  const words = title.split(" ");
  const shots = items.filter((i) => i.photos[0]).slice(0, 3);
  const tilt = ["-7deg", "5deg", "-2deg"];
  return (
    <section className="relative isolate overflow-hidden border-b border-line bg-gradient-to-b from-amber-light/50 via-paper to-paper">
      <Bunting className="relative mx-auto max-w-6xl px-2 text-tag-dark/40" flags={16} />
      <SunRings className="animate-spin-slow pointer-events-none absolute -top-40 -right-40 -z-10 size-[34rem] text-amber/25 md:-top-56 md:-right-24 md:size-[52rem]" />

      <div className="container-page grid items-center gap-10 pt-10 pb-16 md:grid-cols-[1.1fr_1fr] md:pt-16 md:pb-24">
        <div>
          <p className="animate-rise eyebrow text-amber" style={delay(0)}>
            {count ? `${count} ${count === 1 ? "thing" : "things"} for sale right now` : "New things coming soon"}
          </p>
          <h1 className="mt-3 text-[2.9rem] leading-[1] md:text-7xl">
            {words.map((w, i) => (
              // The space sits between the words: inside an inline-block it would be dropped.
              <span key={i}>
                <span className="animate-rise inline-block" style={delay(i + 1)}>
                  {w}
                </span>
                {i < words.length - 1 && " "}
              </span>
            ))}
          </h1>
          <p className="animate-rise mt-5 max-w-lg text-lg text-ink/75 md:text-xl" style={delay(words.length + 1)}>
            {tagline}
          </p>
          <div className="animate-rise mt-8 flex flex-wrap gap-3" style={delay(words.length + 2)}>
            <Link href="/shop" className="btn btn-primary group">
              See everything for sale
              <span className="transition-transform group-hover:translate-x-1" aria-hidden="true">
                →
              </span>
            </Link>
            <Link href="/about" className="btn btn-outline">
              How pickup works
            </Link>
          </div>
        </div>

        <div className="relative mx-auto h-[22rem] w-full max-w-md md:h-[28rem]">
          {shots.length ? (
            shots.map((item, i) => (
              <Link
                key={item.id}
                href={`/item/${item.slug}`}
                className="polaroid group absolute block w-[58%] rounded-sm bg-white p-2.5 pb-10 shadow-[0_18px_40px_-14px_rgba(31,42,55,0.45)] transition-shadow hover:z-10 hover:shadow-[0_24px_50px_-12px_rgba(31,42,55,0.55)]"
                style={{ "--r": tilt[i], "--i": i, left: ["0%", "40%", "18%"][i], top: ["4%", "14%", "44%"][i], zIndex: i } as React.CSSProperties}
              >
                <span className="relative block aspect-square overflow-hidden bg-kraft">
                  <ItemPhoto url={item.photos[0].url} alt={item.title} sizes="(min-width: 768px) 260px, 55vw" priority={i === 0} />
                </span>
                <span className="absolute inset-x-3 bottom-2 flex items-baseline justify-between gap-2 font-display text-sm">
                  <span className="truncate">{item.title}</span>
                  <span className="shrink-0 font-bold text-tag">{item.priceCents === 0 ? "Free" : money(item.priceCents)}</span>
                </span>
              </Link>
            ))
          ) : (
            <div className="absolute inset-8 grid place-items-center rounded-3xl border-2 border-dashed border-kraft-dark text-muted">Photos of what&apos;s for sale show up here.</div>
          )}
          <Starburst className="absolute right-0 -bottom-4 z-20 size-28 text-sm md:-right-6 md:bottom-2 md:size-36 md:text-base" />
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-4 left-1/2 hidden -translate-x-1/2 md:block" aria-hidden="true">
        <span className="block h-10 w-px animate-pulse bg-gradient-to-b from-transparent to-amber" />
      </div>
    </section>
  );
}
