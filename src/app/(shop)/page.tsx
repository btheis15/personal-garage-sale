import Link from "next/link";
import { Hero } from "@/components/Hero";
import { ItemCard } from "@/components/ItemCard";
import { ItemPhoto } from "@/components/ItemPhoto";
import { Marquee } from "@/components/Marquee";
import { Bunting, Divider, HouseLine, Starburst, SunRings, TagLine } from "@/components/ornaments";
import { availability } from "@/lib/availability";
import { getCatalog, getSettings } from "@/lib/shop";
import { CATEGORIES } from "@/lib/site";

const delay = (i: number) => ({ "--i": i }) as React.CSSProperties;

export default async function Home() {
  const [items, settings] = await Promise.all([getCatalog(), getSettings()]);
  const forSale = items.filter((i) => availability(i) !== "sold");
  const featured = forSale.filter((i) => i.featured).slice(0, 4);
  const latest = forSale.slice(0, 10);
  const justSold = items.filter((i) => availability(i) === "sold").slice(0, 4);
  const heroItems = [...featured, ...forSale.filter((i) => !i.featured)].slice(0, 3);
  const storyItem = forSale.find((i) => i.photos.length > 1) ?? forSale[3] ?? forSale[0];
  const categories = CATEGORIES.map((c) => ({ ...c, count: forSale.filter((i) => i.category === c.value).length, cover: forSale.find((i) => i.category === c.value && i.photos[0]) })).filter((c) => c.count);

  const promises = [
    { icon: "M12 21s7-6.2 7-11.5A7 7 0 005 9.5C5 14.8 12 21 12 21z M12 7a2.5 2.5 0 110 5 2.5 2.5 0 010-5", title: "Pick it up nearby", text: settings.pickupArea },
    { icon: "M12 3l7 3v6c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-3z M9 12l2 2 4-4", title: "Pay safely online", text: `Card, Apple Pay, Google Pay or Bitcoin Cash${settings.payAtPickup ? ", or at pickup" : ""}` },
    { icon: "M3 12V4h8l10 10-8 8L3 12z M7.5 7a1.5 1.5 0 110 3 1.5 1.5 0 010-3", title: "Held just for you", text: "Once you check out, nobody else can buy it" },
  ];
  const steps = [
    { n: 1, title: "Find something you like", text: "Everything here is from our house. New things go up all the time." },
    { n: 2, title: "Pay online, or hold it", text: `By card or Bitcoin Cash, or hold it ${settings.payAtPickupHours} hours and pay at pickup.` },
    { n: 3, title: "Come grab it", text: "I'll send the address and we'll find a time. Usually evenings and weekends." },
  ];

  return (
    <>
      <Hero title={settings.name} tagline={settings.tagline} count={forSale.length} items={heroItems} />

      <Marquee categories={categories.map(({ value, label, count }) => ({ value, label, count }))} />

      {/* Promises */}
      <section className="border-b border-line bg-white/60">
        <ul className="container-page grid gap-4 py-6 sm:grid-cols-3">
          {promises.map((p, i) => (
            <li key={p.title} className="flex items-start gap-3" data-reveal style={delay(i)}>
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-amber-light/70 text-tag-dark">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={p.icon} />
                </svg>
              </span>
              <span>
                <span className="block font-semibold">{p.title}</span>
                <span className="block text-sm text-muted">{p.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Just listed: a row to swipe through */}
      <section className="mt-16 md:mt-24">
        <div className="container-page mb-7 flex items-end justify-between gap-4">
          <div data-reveal>
            <p className="eyebrow text-amber">Fresh off the shelf</p>
            <h2 className="mt-1 text-4xl md:text-5xl">Just listed</h2>
          </div>
          <Link href="/shop" className="group inline-flex items-center gap-1 font-semibold text-tag" data-reveal>
            See all <span className="transition-transform group-hover:translate-x-1">→</span>
          </Link>
        </div>
        {latest.length ? (
          <ul className="no-scrollbar container-page flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 md:gap-6">
            {latest.map((item, i) => (
              <li key={item.id} className="w-[46%] shrink-0 snap-start sm:w-[31%] lg:w-[23%]">
                <ItemCard item={item} morph index={i} priority={i < 2 && !heroItems.length} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="container-page text-muted">Nothing for sale right now. Check back soon!</p>
        )}
      </section>

      <Divider className="mt-16 md:mt-24" />

      {/* Browse by kind of thing */}
      {categories.length > 1 && (
        <section className="container-page mt-10 md:mt-14">
          <h2 className="text-center text-4xl md:text-5xl" data-reveal>
            Have a look around
          </h2>
          <ul className="mt-10 flex flex-wrap justify-center gap-4 md:gap-6">
            {categories.slice(0, 8).map((c, i) => (
              <li key={c.value} className="w-[calc(50%-0.5rem)] md:w-[calc(25%-1.125rem)]" data-reveal style={delay(i % 4)}>
                <Link href={`/shop?category=${c.value}`} className="group block">
                  <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-kraft" data-reveal="curtain">
                    <div className="absolute inset-0 transition duration-[1400ms] ease-soft group-hover:scale-[1.07]">
                      <ItemPhoto url={c.cover?.photos[0]?.url} alt="" sizes="(min-width: 768px) 25vw, 50vw" />
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-tag-dark/80 via-tag-dark/10 to-transparent" />
                    <div className="absolute inset-x-3 bottom-3 text-paper">
                      <p className="font-display text-xl leading-tight md:text-2xl">{c.label}</p>
                      <p className="text-sm text-paper/80">
                        {c.count} {c.count === 1 ? "thing" : "things"} <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
                      </p>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* How it works: a navy band with bunting */}
      <section className="relative isolate mt-20 overflow-hidden bg-tag-dark pt-6 text-paper md:mt-28">
        <Bunting className="relative mx-auto max-w-6xl px-2 text-paper/40" flags={18} />
        <SunRings className="animate-spin-slow pointer-events-none absolute -bottom-48 -left-40 -z-10 size-[36rem] text-amber/15" />
        <TagLine className="animate-float pointer-events-none absolute top-24 right-6 -z-10 w-24 text-amber/40 md:right-16 md:w-32" />
        <div className="container-page py-14 md:py-20">
          <div className="max-w-2xl" data-reveal>
            <p className="eyebrow text-amber-light">Simple as a driveway sale</p>
            <h2 className="mt-2 text-4xl md:text-6xl">How it works</h2>
          </div>
          <ol className="mt-10 grid gap-4 md:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s.n} data-reveal style={delay(i)} className="rounded-2xl border border-paper/15 bg-white/5 p-6 backdrop-blur-sm transition duration-500 hover:-translate-y-1 hover:border-amber/60 hover:bg-white/10">
                <span className="grid size-11 place-items-center rounded-full bg-amber font-display text-xl font-bold text-tag-dark">{s.n}</span>
                <p className="mt-4 font-display text-2xl">{s.title}</p>
                <p className="mt-2 text-paper/75">{s.text}</p>
              </li>
            ))}
          </ol>
          <div className="mt-10" data-reveal>
            <Link href="/shop" className="btn btn-light">
              Start browsing
            </Link>
          </div>
        </div>
      </section>

      {/* About us */}
      <section className="container-page mt-20 md:mt-28">
        <div className="grid items-center gap-12 md:grid-cols-2 md:gap-20">
          <div className="relative isolate mx-auto w-full max-w-sm md:order-2">
            <SunRings className="animate-spin-slow pointer-events-none absolute -inset-16 -z-10 text-amber/25" />
            <div className="rotate-2 rounded-sm bg-white p-3 pb-12 shadow-[0_24px_50px_-18px_rgba(31,42,55,0.45)]" data-reveal>
              <div className="relative aspect-[4/5] overflow-hidden bg-kraft" data-reveal="curtain">
                {storyItem && (
                  <div className="parallax absolute inset-0">
                    <ItemPhoto url={(storyItem.photos[1] ?? storyItem.photos[0])?.url} alt="" sizes="(min-width: 768px) 30vw, 80vw" />
                  </div>
                )}
              </div>
              <p className="absolute inset-x-4 bottom-3 text-center font-display text-lg text-muted">From our house to yours</p>
            </div>
            <Starburst className="absolute -bottom-8 -left-8 size-24 text-xs" text="Priced to go" />
          </div>
          <div data-reveal>
            <HouseLine className="w-28 text-amber" />
            <p className="eyebrow mt-4 text-amber">About us</p>
            <h2 className="mt-2 text-4xl md:text-5xl">A real family, a real garage</h2>
            <p className="mt-5 max-w-md leading-relaxed whitespace-pre-line text-ink/80">{settings.about}</p>
            <Link href="/about" className="btn btn-outline mt-8">
              Pickup & questions
            </Link>
          </div>
        </div>
      </section>

      {featured.length > 0 && (
        <section className="container-page mt-20 md:mt-28">
          <div className="mb-8 text-center" data-reveal>
            <p className="eyebrow text-amber">Our picks</p>
            <h2 className="mt-1 text-4xl md:text-5xl">Worth a look</h2>
          </div>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-9 md:grid-cols-4 md:gap-x-6">
            {featured.map((item, i) => (
              <li key={item.id}>
                <ItemCard item={item} index={i} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {justSold.length > 0 && (
        <section className="container-page mt-20 md:mt-28">
          <div className="mb-8 flex items-end justify-between" data-reveal>
            <h2 className="text-3xl text-muted md:text-4xl">Recently sold</h2>
            <p className="text-sm text-muted">Sorry you missed these!</p>
          </div>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-9 md:grid-cols-4 md:gap-x-6">
            {justSold.map((item, i) => (
              <li key={item.id}>
                <ItemCard item={item} index={i} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
