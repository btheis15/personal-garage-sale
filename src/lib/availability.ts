import type { Availability, Item } from "./types";

/** Sold, on hold (a checkout is paying for the last one), or available. */
export function availability(item: Pick<Item, "status" | "quantity" | "heldUntil">, now = Date.now()): Availability {
  if (item.status === "sold") return "sold";
  if (item.quantity > 0) return "available";
  if (item.heldUntil && Date.parse(item.heldUntil) > now) return "on_hold";
  // Its hold ran out: the next checkout gives it back (expire_stale_orders), so it can be bought.
  return item.heldUntil ? "available" : "sold";
}
