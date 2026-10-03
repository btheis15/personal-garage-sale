import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BuyButtons } from "@/components/BuyButtons";
import { Gallery } from "@/components/Gallery";
import { ItemCard } from "@/components/ItemCard";
import { BoxIcon, PinIcon, ShieldIcon, TruckIcon } from "@/components/icons";
import { availability } from "@/lib/availability";
import { getCatalog, getItemBySlug } from "@/lib/shop";
import { getSettings } from "@/lib/shop";
import { CONDITIONS, categoryLabel, money, siteUrl } from "@/lib/site";

export async function generateStaticParams() {
  return [];
}

export async function generateMetadata(props: PageProps<"/item/[slug]">): Promise<Metadata> {
  const item = await getItemBySlug((await props.params).slug);
  if (!item) return {};
  const description = `${money(item.priceCents)} · ${item.description.slice(0, 150)}`;
  const image = item.photos[0]?.url;
  return {
    title: item.title,
    description,
    alternates: { canonical: `/item/${item.slug}` },
    openGraph: { title: item.title, description, ...(image && !image.endsWith(".svg") ? { images: [{ url: image }] } : {}) },
  };
}

export default async function ItemPage(props: PageProps<"/item/[slug]">) {
  const { slug } = await props.params;
  const [item, settings, catalog] = await Promise.all([getItemBySlug(slug), getSettings(), getCatalog()]);
  if (!item) notFound();
  const state = availability(item);
  const condition = CONDITIONS.find((c) => c.value === item.condition);
  const more = catalog.filter((i) => i.id !== item.id && i.category === item.category && availability(i) !== "sold").slice(0, 4);
  const fb = item.channels.facebook?.url;
  const ask = settings.contactPhone
    ? `sms:${settings.contactPhone.replace(/[^\d+]/g, "")}?&body=${encodeURIComponent(`Hi! About "${item.title}" (${siteUrl()}/item/${item.slug}): `)}`
    : settings.contactEmail
      ? `mailto:${settings.contactEmail}?subject=${encodeURIComponent(item.title)}&body=${encodeURIComponent(`${siteUrl()}/item/${item.slug}\n\n`)}`
      : null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: item.title,
    description: item.description,
    image: item.photos.map((p) => p.url).filter((u) => u.startsWith("http")),
    offers: {
      "@type": "Offer",
      price: (item.priceCents / 100).toFixed(2),
      priceCurrency: "USD",
      availability: state === "sold" ? "https://schema.org/SoldOut" : "https://schema.org/InStock",
      itemCondition: item.condition === "new" ? "https://schema.org/NewCondition" : "https://schema.org/UsedCondition",
      url: `${siteUrl()}/item/${item.slug}`,
    },
  };

  return (
    <div className="container-page py-6 md:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <nav className="mb-4 text-sm text-muted">
        <Link href="/shop" className="hover:underline">
          Shop
        </Link>{" "}
        /{" "}
        <Link href={`/shop?category=${item.category}`} className="hover:underline">
          {categoryLabel(item.category)}
        </Link>
      </nav>
      <div className="grid gap-8 md:grid-cols-2 md:gap-12">
        <Gallery photos={item.photos} title={item.title} slug={item.slug} dim={state === "sold"} />
        <div>
          <h1 className="animate-rise text-4xl md:text-5xl" style={{ "--i": 0 } as React.CSSProperties}>
            {item.title}
          </h1>
          <div className="animate-rise mt-3 flex flex-wrap items-center gap-3" style={{ "--i": 1 } as React.CSSProperties}>
            <span className="font-display text-4xl font-semibold text-tag">{item.priceCents === 0 ? "Free" : money(item.priceCents)}</span>
            {item.compareAtCents && <span className="text-lg text-muted line-through">{money(item.compareAtCents)}</span>}
            {item.obo && state === "available" && <span className="rounded-md bg-sun px-2 py-0.5 text-sm font-bold">or best offer</span>}
          </div>
          <dl className="animate-rise mt-5 grid grid-cols-2 gap-3 text-sm" style={{ "--i": 2 } as React.CSSProperties}>
            <div className="rounded-lg border border-line bg-white p-3">
              <dt className="text-muted">Condition</dt>
              <dd className="font-bold">{condition?.label}</dd>
              <dd className="text-muted">{condition?.hint}</dd>
            </div>
            <div className="rounded-lg border border-line bg-white p-3">
              <dt className="text-muted">{item.size ? "Size" : item.quantity > 1 ? "Available" : "Category"}</dt>
              <dd className="font-bold">{item.size || (item.quantity > 1 ? `${item.quantity} of them` : categoryLabel(item.category))}</dd>
              {item.brand && <dd className="text-muted">{item.brand}</dd>}
            </div>
          </dl>

          <div className="animate-rise mt-6" style={{ "--i": 3 } as React.CSSProperties}>
            <BuyButtons item={item} />
          </div>
          {item.obo && state === "available" && ask && (
            <p className="mt-3 text-sm">
              Want to make an offer?{" "}
              <a href={ask} className="font-semibold text-tag underline underline-offset-4">
                Send me a message
              </a>
            </p>
          )}

          {item.description && (
            <div className="mt-8" data-reveal>
              <h2 className="text-2xl">About it</h2>
              <div className="mt-2 space-y-3 whitespace-pre-line text-ink/90">{item.description}</div>
            </div>
          )}

          <ul className="mt-8 space-y-3 rounded-2xl border border-line bg-white p-5 text-sm" data-reveal>
            {item.pickup && (
              <li className="flex gap-3">
                <PinIcon className="shrink-0 text-tag" />
                <span>
                  <strong>Pickup</strong> · {settings.pickupArea}. You&apos;ll get the address and a time once it&apos;s yours.
                </span>
              </li>
            )}
            {item.ships && settings.shipping && (
              <li className="flex gap-3">
                <TruckIcon className="shrink-0 text-sky" />
                <span>
                  <strong>Ships in the US</strong> · {money(item.shippingCents ?? settings.defaultShippingCents)}
                </span>
              </li>
            )}
            <li className="flex gap-3">
              <ShieldIcon className="shrink-0 text-leaf" />
              <span>
                <strong>Secure checkout</strong> · cards, Apple Pay and Google Pay through Stripe, or Bitcoin Cash{settings.payAtPickup && item.pickup ? ". Or hold it and pay at pickup." : "."}
              </span>
            </li>
            {fb && (
              <li className="flex gap-3">
                <BoxIcon className="shrink-0 text-muted" />
                <span>
                  Also on{" "}
                  <a href={fb} target="_blank" rel="noopener noreferrer" className="font-bold underline underline-offset-4">
                    Facebook Marketplace
                  </a>
                  , if you&apos;d rather message me there.
                </span>
              </li>
            )}
          </ul>
        </div>
      </div>

      {more.length > 0 && (
        <section className="mt-16">
          <h2 className="text-3xl" data-reveal>
            More {categoryLabel(item.category).toLowerCase()}
          </h2>
          <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">
            {more.map((i, n) => (
              <ItemCard key={i.id} item={i} index={n} morph />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
