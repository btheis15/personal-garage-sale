import { ItemList } from "@/components/sell/ItemList";
import { hasDatabase } from "@/lib/db";
import { listItems, soldButListedElsewhere } from "@/lib/items";
import { listOrders } from "@/lib/orders";

export const dynamic = "force-dynamic";

export default async function SellHome() {
  const [items, orders] = hasDatabase ? await Promise.all([listItems(), listOrders({ limit: 50 })]) : [[], []];
  const waiting = orders.filter((o) => o.status === "paid" || o.status === "reserved").length;
  return <ItemList items={items} waitingOrders={waiting} soldElsewhereIds={soldButListedElsewhere(items)} />;
}
