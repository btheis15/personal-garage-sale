import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OrderView } from "@/components/OrderView";
import type { BchView } from "@/components/bch/types";
import { isId } from "@/lib/http";
import { freshSettings, hasShop, ShopApiError, shopApi } from "@/lib/shop";
import type { BuyerOrder, Payments } from "@/lib/types";

export const metadata: Metadata = { title: "Your order", robots: { index: false } };

export default async function OrderPage(props: PageProps<"/order/[id]">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  if (!hasShop || !isId(id)) notFound();

  let order: BuyerOrder;
  let payments: Payments;
  try {
    // Back from Stripe: ask Stripe now instead of waiting for its notice.
    if (typeof sp.session_id === "string") await shopApi(`/api/orders/${id}/stripe-return`, { method: "POST", body: { sessionId: sp.session_id } }).catch(() => null);
    ({ order, payments } = await shopApi<{ order: BuyerOrder; payments: Payments }>(`/api/orders/${id}`));
  } catch (e) {
    if (e instanceof ShopApiError && e.status === 404) notFound();
    throw e;
  }

  // Starts the Bitcoin Cash payment on the first visit (an address and a price), or looks at it again.
  const bch = order.method === "bch" && order.status === "pending" ? await shopApi<BchView>(`/api/orders/${id}/bch/start`, { method: "POST", body: {} }).catch(() => null) : null;
  const { settings: s } = await freshSettings();
  return (
    <OrderView
      initial={order}
      bch={bch}
      shop={{ name: s.name, pickupInstructions: s.pickupInstructions, pickupArea: s.pickupArea, venmo: s.venmo, contactEmail: s.contactEmail, contactPhone: s.contactPhone }}
      can={{ stripe: payments.stripe, bch: payments.bch }}
      walletConnectProjectId={process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? ""}
      returnedFromCard={sp.paid === "card"}
    />
  );
}
