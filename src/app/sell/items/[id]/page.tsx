import { notFound } from "next/navigation";
import { EditItem } from "@/components/sell/EditItem";
import { getItem } from "@/lib/items";
import { isUuid } from "@/lib/orders";
import { readSettings } from "@/lib/settings";

export const metadata = { title: "Edit item" };

export default async function EditItemPage(props: PageProps<"/sell/items/[id]">) {
  const { id } = await props.params;
  const item = isUuid(id) ? await getItem(id) : null;
  if (!item) notFound();
  const s = await readSettings();
  return <EditItem item={item} shippingOn={s.shipping} defaultShippingCents={s.defaultShippingCents} />;
}
