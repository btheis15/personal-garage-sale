import { ItemList } from "@/components/sell/ItemList";
import { freshSettings, hasShop, shopApi } from "@/lib/shop";
import type { Item, Order } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SellHome() {
  if (!hasShop) return <ItemList items={[]} waitingOrders={0} soldElsewhereIds={[]} shopName="" />;
  const [{ items, soldElsewhere }, { orders }, { settings }] = await Promise.all([
    shopApi<{ items: Item[]; soldElsewhere: string[] }>("/api/admin/items", { admin: true }),
    shopApi<{ orders: Order[] }>("/api/admin/orders", { admin: true }),
    freshSettings(),
  ]);
  const waiting = orders.filter((o) => o.status === "paid" || o.status === "reserved").length;
  return <ItemList items={items} waitingOrders={waiting} soldElsewhereIds={soldElsewhere} shopName={settings.name} />;
}
