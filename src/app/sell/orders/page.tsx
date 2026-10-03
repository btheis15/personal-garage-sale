import { OrderList } from "@/components/sell/OrderList";
import { hasDatabase } from "@/lib/db";
import { listOrders } from "@/lib/orders";

export const metadata = { title: "Orders" };
export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  return <OrderList orders={hasDatabase ? await listOrders() : []} />;
}
