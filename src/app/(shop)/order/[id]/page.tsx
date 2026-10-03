import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OrderView } from "@/components/OrderView";
import { bchStart, hasBch } from "@/lib/bch";
import { hasDatabase } from "@/lib/db";
import { buyerView, getOrder } from "@/lib/orders";
import { readSettings } from "@/lib/settings";
import { hasStripe, syncSessionById } from "@/lib/stripe";

export const metadata: Metadata = { title: "Your order", robots: { index: false } };

export default async function OrderPage(props: PageProps<"/order/[id]">) {
  if (!hasDatabase) notFound();
  const { id } = await props.params;
  const sp = await props.searchParams;
  let order = await getOrder(id);
  if (!order) notFound();

  // Back from Stripe: don't wait for the webhook, ask Stripe now.
  if (typeof sp.session_id === "string" && order.status === "pending" && hasStripe())
    order = (await syncSessionById(sp.session_id).catch(() => null)) ?? order;

  // Starts the Bitcoin Cash payment on the first visit (an address and a price), or looks at it again.
  const bch = order.method === "bch" && hasBch() && order.status === "pending" ? await bchStart(order).catch((e) => (console.error("[bch]", e), null)) : null;
  if (bch?.state === "paid" && order.status === "pending") order = (await getOrder(id)) ?? order;

  const s = await readSettings();
  return (
    <OrderView
      initial={buyerView(order)}
      bch={bch}
      shop={{
        name: s.name,
        pickupInstructions: s.pickupInstructions,
        pickupArea: s.pickupArea,
        venmo: s.venmo,
        contactEmail: s.contactEmail,
        contactPhone: s.contactPhone,
      }}
      can={{ stripe: hasStripe(), bch: hasBch() }}
      walletConnectProjectId={process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? ""}
      returnedFromCard={sp.paid === "card"}
    />
  );
}
