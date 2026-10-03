"use client";

import type { Item } from "@/lib/types";
import { ItemEditor } from "./ItemEditor";
import { ListElsewhere } from "./ListElsewhere";

export function EditItem({ item, shippingOn, defaultShippingCents }: { item: Item; shippingOn: boolean; defaultShippingCents: number }) {
  return (
    <>
      <ItemEditor item={item} shippingOn={shippingOn} defaultShippingCents={defaultShippingCents} />
      {item.status !== "draft" && <ListElsewhere item={item} />}
    </>
  );
}
