import type { MetadataRoute } from "next";
import { availability } from "@/lib/availability";
import { getCatalog } from "@/lib/shop";
import { siteUrl } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const items = (await getCatalog()).filter((i) => availability(i) !== "sold");
  return [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/shop`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/about`, changeFrequency: "monthly", priority: 0.4 },
    ...items.map((i) => ({ url: `${base}/item/${i.slug}`, lastModified: i.updatedAt, changeFrequency: "weekly" as const, priority: 0.7 })),
  ];
}
