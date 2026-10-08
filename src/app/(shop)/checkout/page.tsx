import type { Metadata } from "next";
import { CheckoutView } from "@/components/CheckoutView";
import { freshSettings, hasShop } from "@/lib/shop";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default async function CheckoutPage(props: PageProps<"/checkout">) {
  const sp = await props.searchParams;
  const { settings: s, payments } = await freshSettings().catch(() => ({ settings: null, payments: null }));
  return (
    <CheckoutView
      cancelledOrder={typeof sp.cancelled === "string" ? sp.cancelled : null}
      options={{
        open: hasShop && Boolean(s),
        stripe: Boolean(payments?.stripe),
        stripeTest: Boolean(payments?.stripeTest),
        bch: Boolean(payments?.bch),
        bchReceipts: Boolean(payments?.bch && payments?.bchReceipts),
        shopName: s?.name ?? "Garage Sale",
        payAtPickup: s?.payAtPickup ?? false,
        payAtPickupHours: s?.payAtPickupHours ?? 48,
        venmo: s?.venmo ?? "",
        shipping: s?.shipping ?? false,
        defaultShippingCents: s?.defaultShippingCents ?? 0,
        pickupArea: s?.pickupArea ?? "",
      }}
    />
  );
}
