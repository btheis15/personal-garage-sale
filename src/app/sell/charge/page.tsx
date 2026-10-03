import { RingUp } from "@/components/sell/RingUp";
import { hasBch } from "@/lib/bch";
import { hasDatabase } from "@/lib/db";
import { listItems } from "@/lib/items";
import { readSettings } from "@/lib/settings";
import { hasStripe } from "@/lib/stripe";

export const metadata = { title: "Ring up a sale" };
export const dynamic = "force-dynamic";

export default async function ChargePage() {
  const [items, s] = await Promise.all([hasDatabase ? listItems({ status: "live" }) : [], readSettings()]);
  return <RingUp items={items} online={{ stripe: hasStripe(), bch: hasBch() }} venmo={s.venmo} />;
}
