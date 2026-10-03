import { notFound } from "next/navigation";
import { EditItem } from "@/components/sell/EditItem";
import { isId } from "@/lib/http";
import { freshSettings, hasShop, shopApi } from "@/lib/shop";
import type { Item } from "@/lib/types";

export const metadata = { title: "Edit item" };
export const dynamic = "force-dynamic";

export default async function EditItemPage(props: PageProps<"/sell/items/[id]">) {
  const { id } = await props.params;
  if (!hasShop || !isId(id)) notFound();
  const item = await shopApi<{ item: Item }>(`/api/admin/items/${id}`, { admin: true }).then((r) => r.item).catch(() => null);
  if (!item) notFound();
  const { settings: s } = await freshSettings();
  return <EditItem item={item} shippingOn={s.shipping} defaultShippingCents={s.defaultShippingCents} shopName={s.name} />;
}
