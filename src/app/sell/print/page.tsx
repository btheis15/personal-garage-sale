import { PrintView } from "@/components/sell/PrintView";
import { freshSettings, hasShop, shopApi } from "@/lib/shop";
import { DEFAULT_SETTINGS } from "@/lib/site";
import type { Item } from "@/lib/types";

export const metadata = { title: "Print QR signs & tags" };
export const dynamic = "force-dynamic";

export default async function PrintPage(props: PageProps<"/sell/print">) {
  const sp = await props.searchParams;
  const [items, { settings, payments }] = hasShop
    ? await Promise.all([shopApi<{ items: Item[] }>("/api/admin/items", { admin: true }).then((r) => r.items.filter((i) => i.status === "live")), freshSettings()])
    : [[], { settings: DEFAULT_SETTINGS, payments: { stripe: false, bch: false, stripeTest: false } }];
  const chosen = typeof sp.items === "string" ? sp.items.split(",") : null;
  return <PrintView items={items} settings={settings} payments={payments} chosen={chosen} />;
}
