import type { Metadata } from "next";
import { ItemCard } from "@/components/ItemCard";
import { ShopFilters } from "@/components/ShopFilters";
import { availability } from "@/lib/availability";
import { getCatalog } from "@/lib/items";
import { CATEGORIES, categoryLabel } from "@/lib/site";

export const metadata: Metadata = { title: "Everything for sale" };

const SORTS = {
  new: "Newest",
  low: "Price: low to high",
  high: "Price: high to low",
} as const;

export default async function ShopPage(props: PageProps<"/shop">) {
  const sp = await props.searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const category = one(sp.category);
  const q = one(sp.q).trim().toLowerCase();
  const sort = (one(sp.sort) in SORTS ? one(sp.sort) : "new") as keyof typeof SORTS;
  const showSold = one(sp.sold) === "1";
  const ships = one(sp.ships) === "1";

  const all = await getCatalog();
  let items = all.filter((i) => showSold || availability(i) !== "sold");
  if (category) items = items.filter((i) => i.category === category);
  if (ships) items = items.filter((i) => i.ships);
  if (q) items = items.filter((i) => `${i.title} ${i.description} ${categoryLabel(i.category)}`.toLowerCase().includes(q));
  if (sort === "low") items = [...items].sort((a, b) => a.priceCents - b.priceCents);
  if (sort === "high") items = [...items].sort((a, b) => b.priceCents - a.priceCents);
  // Sold things after everything still for sale.
  items = [...items].sort((a, b) => Number(availability(a) === "sold") - Number(availability(b) === "sold"));

  const categories = CATEGORIES.filter((c) => all.some((i) => i.category === c.value && availability(i) !== "sold"));

  return (
    <div className="container-page py-8">
      <h1 className="text-4xl">{category ? categoryLabel(category) : "Everything for sale"}</h1>
      <ShopFilters categories={categories.map((c) => ({ value: c.value, label: c.label }))} sorts={SORTS} current={{ category, q: one(sp.q), sort, sold: showSold, ships }} />
      {items.length ? (
        <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item, i) => (
            <ItemCard key={item.id} item={item} priority={i < 4} />
          ))}
        </div>
      ) : (
        <p className="mt-8 rounded-2xl bg-kraft p-8 text-center text-muted">Nothing matches that. Try another search or category.</p>
      )}
    </div>
  );
}
