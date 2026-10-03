import { ItemEditor } from "@/components/sell/ItemEditor";
import { readSettings } from "@/lib/settings";

export const metadata = { title: "Sell something" };

export default async function NewItem() {
  const s = await readSettings();
  return <ItemEditor shippingOn={s.shipping} defaultShippingCents={s.defaultShippingCents} />;
}
