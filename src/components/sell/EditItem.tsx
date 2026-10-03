"use client";

import type { Item } from "@/lib/types";
import { ItemEditor } from "./ItemEditor";
import { ListElsewhere } from "./ListElsewhere";

export function EditItem({ item, shippingOn, defaultShippingCents, shopName }: { item: Item; shippingOn: boolean; defaultShippingCents: number; shopName: string }) {
  return (
    <>
      <ItemEditor item={item} shippingOn={shippingOn} defaultShippingCents={defaultShippingCents} shopName={shopName} />
      {item.status !== "draft" && <ListElsewhere item={item} />}
    </>
  );
}
