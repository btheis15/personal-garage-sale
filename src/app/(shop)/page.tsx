import Link from "next/link";
import { ItemCard } from "@/components/ItemCard";
import { PinIcon, ShieldIcon, TagIcon } from "@/components/icons";
import { availability } from "@/lib/availability";
import { getCatalog } from "@/lib/shop";
import { getSettings } from "@/lib/shop";
import { CATEGORIES } from "@/lib/site";

export default async function Home() {
  const [items, settings] = await Promise.all([getCatalog(), getSettings()]);
  const forSale = items.filter((i) => availability(i) !== "sold");
  const featured = forSale.filter((i) => i.featured).slice(0, 4);
  const latest = forSale.slice(0, 12);
  const justSold = items.filter((i) => availability(i) === "sold").slice(0, 4);
  const categories = CATEGORIES.filter((c) => forSale.some((i) => i.category === c.value));

  return (
    <>
      <section className="border-b border-line bg-white">
        <div className="container-page grid gap-8 py-10 md:grid-cols-[1.4fr_1fr] md:items-center md:py-16">
          <div>
            <p className="eyebrow">{forSale.length ? `${forSale.length} ${forSale.length === 1 ? "thing" : "things"} for sale right now` : "New things coming soon"}</p>
            <h1 className="mt-2 text-4xl md:text-6xl">{settings.name}</h1>
            <p className="mt-3 max-w-xl text-xl text-muted">{settings.tagline}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/shop" className="btn btn-primary">
                See everything for sale
              </Link>
              <Link href="/about" className="btn btn-outline">
                About & pickup
              </Link>
            </div>
          </div>
          <div className="rounded-xl border border-line bg-paper p-5">
            <p className="leading-relaxed text-ink/85">{settings.about}</p>
            <ul className="mt-4 space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <PinIcon size={18} className="mt-0.5 shrink-0 text-tag" />
                <span>{settings.pickupArea}</span>
              </li>
              <li className="flex items-start gap-2">
                <ShieldIcon size={18} className="mt-0.5 shrink-0 text-leaf" />
                <span>Pay by card, Apple Pay, Google Pay or Bitcoin Cash{settings.payAtPickup ? ", or pay at pickup" : ""}</span>
              </li>
              <li className="flex items-start gap-2">
                <TagIcon size={18} className="mt-0.5 shrink-0 text-sky" />
                <span>Once it&apos;s paid for, it comes off the site and it&apos;s yours</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {categories.length > 1 && (
        <section className="container-page mt-10">
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
            {categories.map((c) => (
              <Link key={c.value} href={`/shop?category=${c.value}`} className="shrink-0 rounded-full border border-line bg-white px-4 py-2 font-semibold hover:border-tag hover:text-tag">
                {c.label}
              </Link>
            ))}
          </div>
        </section>
      )}

      {featured.length > 0 && (
        <section className="container-page mt-12">
          <h2 className="text-2xl md:text-3xl">Worth a look</h2>
          <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">
            {featured.map((item, i) => (
              <ItemCard key={item.id} item={item} priority={i < 2} />
            ))}
          </div>
        </section>
      )}

      <section className="container-page mt-12">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-2xl md:text-3xl">Just listed</h2>
          <Link href="/shop" className="font-semibold text-tag hover:underline">
            See all →
          </Link>
        </div>
        {latest.length ? (
          <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
            {latest.map((item, i) => (
              <ItemCard key={item.id} item={item} priority={!featured.length && i < 2} />
            ))}
          </div>
        ) : (
          <p className="mt-5 rounded-lg bg-kraft p-8 text-center text-muted">Nothing for sale right now. Check back soon!</p>
        )}
      </section>

      {justSold.length > 0 && (
        <section className="container-page mt-14">
          <h2 className="text-2xl text-muted">Recently sold</h2>
          <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">
            {justSold.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
