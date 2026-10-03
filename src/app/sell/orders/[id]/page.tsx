import { notFound } from "next/navigation";
import { OrderDetail } from "@/components/sell/OrderDetail";
import { bch, hasBch } from "@/lib/bch";
import { photoUrl } from "@/lib/db";
import { getOrder } from "@/lib/orders";

export const metadata = { title: "Order" };
export const dynamic = "force-dynamic";

export default async function OrderPage(props: PageProps<"/sell/orders/[id]">) {
  const order = await getOrder((await props.params).id);
  if (!order) notFound();
  const payment = order.method === "bch" && hasBch() ? await bch().payment(order.id).catch(() => null) : null;
  return (
    <OrderDetail
      order={order}
      photos={Object.fromEntries(order.items.map((i) => [i.id, i.photo ? photoUrl(i.photo) : null]))}
      bch={payment ? { address: payment.address, events: payment.events ?? [], problems: payment.problems ?? [] } : null}
    />
  );
}
