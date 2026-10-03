import type { Metadata } from "next";
import { CheckoutView } from "@/components/CheckoutView";
import { hasBch } from "@/lib/bch";
import { hasDatabase } from "@/lib/db";
import { readSettings } from "@/lib/settings";
import { hasStripe, stripeTestMode } from "@/lib/stripe";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default async function CheckoutPage(props: PageProps<"/checkout">) {
  const sp = await props.searchParams;
  const s = await readSettings();
  return (
    <CheckoutView
      cancelledOrder={typeof sp.cancelled === "string" ? sp.cancelled : null}
      options={{
        open: hasDatabase,
        stripe: hasStripe(),
        stripeTest: hasStripe() && stripeTestMode(),
        bch: hasBch(),
        payAtPickup: s.payAtPickup,
        payAtPickupHours: s.payAtPickupHours,
        venmo: s.venmo,
        shipping: s.shipping,
        defaultShippingCents: s.defaultShippingCents,
        pickupArea: s.pickupArea,
      }}
    />
  );
}
