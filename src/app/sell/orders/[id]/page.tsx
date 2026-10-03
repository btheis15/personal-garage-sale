import { notFound } from "next/navigation";
import { OrderDetail } from "@/components/sell/OrderDetail";
import { isId } from "@/lib/http";
import { hasShop, shopApi } from "@/lib/shop";
import type { Order } from "@/lib/types";

export const metadata = { title: "Order" };
export const dynamic = "force-dynamic";

type BchInfo = { address: string; events: { at: string; kind: string; message: string }[]; problems: { kind: string; message: string }[] };

export default async function OrderPage(props: PageProps<"/sell/orders/[id]">) {
  const { id } = await props.params;
  if (!hasShop || !isId(id)) notFound();
  const data = await shopApi<{ order: Order; bch: BchInfo | null }>(`/api/admin/orders/${id}`, { admin: true }).catch(() => null);
  if (!data) notFound();
  return <OrderDetail order={data.order} photos={Object.fromEntries(data.order.items.map((i) => [i.id, i.photo ?? null]))} bch={data.bch} />;
}
