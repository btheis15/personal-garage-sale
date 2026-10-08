import type { Metadata } from "next";
import { SharePage } from "@/components/share/SharePage";
import { availability } from "@/lib/availability";
import { getCatalog, getSettings } from "@/lib/shop";

export const metadata: Metadata = { title: "Your page · Spread the word", robots: { index: false } };

/** The friend's own page. Their key stays in the page's # part and on their device, never in a URL the server sees. */
export default async function MySharePage() {
  const [items, s] = await Promise.all([getCatalog(), getSettings()]);
  const list = items
    .filter((i) => availability(i) !== "sold")
    .map((i) => ({ slug: i.slug, title: i.title, photo: i.photos[0]?.url ?? null, sold: false }));
  return (
    <div className="container-page max-w-3xl py-10">
      <SharePage items={list} contact={s.contactPhone || s.contactEmail} />
    </div>
  );
}
