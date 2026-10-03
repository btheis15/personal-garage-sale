import Link from "next/link";
import { ItemCard } from "@/components/ItemCard";
import { PinIcon, ShieldIcon, TagIcon } from "@/components/icons";
import { availability } from "@/lib/availability";
import { getCatalog } from "@/lib/items";
import { getSettings } from "@/lib/settings";
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
      <section className="border-b border-line bg-[radial-gradient(circle_at_85%_10%,var(--color-tag-light),transparent_45%),radial-gradient(circle_at_10%_90%,#fff3c4,transparent_40%)]">
        <div className="container-page grid gap-8 py-12 md:grid-cols-[1.3fr_1fr] md:items-center md:py-20">
          <div>
            <p className="eyebrow">{forSale.length ? `${forSale.length} ${forSale.length === 1 ? "thing" : "things"} for sale` : "New things coming soon"}</p>
            <h1 className="mt-3 text-5xl md:text-7xl">{settings.name}</h1>
            <p className="mt-4 max-w-xl text-xl text-muted">{settings.tagline}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/shop" className="btn btn-primary">
                Browse everything
              </Link>
              <Link href="/about" className="btn btn-outline">
                How pickup works
              </Link>
            </div>
          </div>
          <ul className="grid gap-3 text-base">
            <li className="flex items-start gap-3 rounded-2xl bg-white/80 p-4 shadow-sm">
              <PinIcon className="mt-0.5 shrink-0 text-tag" />
              <span>
                <strong>Pick it up</strong>
                <span className="block text-muted">{settings.pickupArea}</span>
              </span>
            </li>
            <li className="flex items-start gap-3 rounded-2xl bg-white/80 p-4 shadow-sm">
              <ShieldIcon className="mt-0.5 shrink-0 text-leaf" />
              <span>
                <strong>Pay securely online</strong>
                <span className="block text-muted">Card, Apple Pay, Google Pay or Bitcoin Cash{settings.payAtPickup ? ", or pay at pickup" : ""}</span>
              </span>
            </li>
            <li className="flex items-start gap-3 rounded-2xl bg-white/80 p-4 shadow-sm">
              <TagIcon className="mt-0.5 shrink-0 text-sky" />
              <span>
                <strong>Buy it now, it&apos;s yours</strong>
                <span className="block text-muted">Paid items come off the site straight away</span>
              </span>
            </li>
          </ul>
        </div>
      </section>

      {categories.length > 1 && (
        <section className="container-page mt-10">
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
            {categories.map((c) => (
              <Link key={c.value} href={`/shop?category=${c.value}`} className="shrink-0 rounded-full border border-line bg-white px-4 py-2 font-bold hover:border-ink">
                {c.label}
              </Link>
            ))}
          </div>
        </section>
      )}

      {featured.length > 0 && (
        <section className="container-page mt-12">
          <h2 className="text-3xl">Worth a look</h2>
          <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">
            {featured.map((item, i) => (
              <ItemCard key={item.id} item={item} priority={i < 2} />
            ))}
          </div>
        </section>
      )}

      <section className="container-page mt-12">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-3xl">Just listed</h2>
          <Link href="/shop" className="font-bold text-tag-dark hover:underline">
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
          <p className="mt-5 rounded-2xl bg-kraft p-8 text-center text-muted">Nothing for sale right now. Check back soon!</p>
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
