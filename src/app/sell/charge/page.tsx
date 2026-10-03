import { RingUp } from "@/components/sell/RingUp";
import { freshSettings, hasShop, shopApi } from "@/lib/shop";
import type { Item } from "@/lib/types";

export const metadata = { title: "Ring up a sale" };
export const dynamic = "force-dynamic";

export default async function ChargePage(props: PageProps<"/sell/charge">) {
  const sp = await props.searchParams;
  if (!hasShop) return <RingUp items={[]} online={{ stripe: false, bch: false }} venmo="" preselect={[]} />;
  const [{ items }, { settings, payments }] = await Promise.all([shopApi<{ items: Item[] }>("/api/admin/items", { admin: true }), freshSettings()]);
  const preselect = typeof sp.item === "string" ? [sp.item] : Array.isArray(sp.item) ? sp.item : [];
  return <RingUp items={items.filter((i) => i.status === "live")} online={{ stripe: payments.stripe, bch: payments.bch }} venmo={settings.venmo} preselect={preselect} />;
}
