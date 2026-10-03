import { ItemEditor } from "@/components/sell/ItemEditor";
import { freshSettings, hasShop } from "@/lib/shop";

export const metadata = { title: "Sell something" };
export const dynamic = "force-dynamic";

export default async function NewItem() {
  const { settings: s } = hasShop ? await freshSettings() : { settings: null };
  return <ItemEditor shippingOn={s?.shipping ?? false} defaultShippingCents={s?.defaultShippingCents ?? 0} shopName={s?.name ?? ""} />;
}
