"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMyOrders } from "./myOrders";

/** A thin bar across the shop while this buyer has something on hold: one tap back to it. */
export function MyHoldsBar() {
  const holds = useMyOrders().filter((o) => o.status === "reserved");
  const path = usePathname();
  if (!holds.length || path.startsWith("/order/")) return null;
  const one = holds.length === 1;
  return (
    <Link href={`/order/${holds[0].id}`} className="block bg-leaf-light px-4 py-2 text-center text-sm font-semibold text-leaf">
      {one ? `Order #${holds[0].number} is on hold for you.` : `You have ${holds.length} orders on hold.`} <span className="underline underline-offset-4">See it or cancel →</span>
    </Link>
  );
}
