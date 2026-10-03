import { OrderList } from "@/components/sell/OrderList";
import { hasShop, shopApi } from "@/lib/shop";
import type { Order } from "@/lib/types";

export const metadata = { title: "Orders" };
export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const orders = hasShop ? (await shopApi<{ orders: Order[] }>("/api/admin/orders", { admin: true })).orders : [];
  return <OrderList orders={orders} />;
}
