"use client";

import Link from "next/link";
import { useState } from "react";
import { money, PAY_METHOD_LABEL } from "@/lib/site";
import type { Order } from "@/lib/types";

const TABS = [
  { value: "todo", label: "To do", match: (o: Order) => o.status === "paid" || o.status === "reserved" },
  { value: "paying", label: "Paying now", match: (o: Order) => o.status === "pending" },
  { value: "done", label: "Done", match: (o: Order) => o.status === "completed" },
  { value: "closed", label: "Closed", match: (o: Order) => o.status === "cancelled" || o.status === "expired" },
] as const;

export const STATUS_LABEL: Record<Order["status"], [string, string]> = {
  pending: ["Paying now", "bg-sky/15 text-sky"],
  reserved: ["Pay at pickup", "bg-sun/50"],
  paid: ["Paid", "bg-leaf-light text-leaf"],
  completed: ["Done", "bg-kraft"],
  cancelled: ["Cancelled", "bg-kraft text-muted"],
  expired: ["Timed out", "bg-kraft text-muted"],
};

export const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)} h ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export function OrderList({ orders }: { orders: Order[] }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["value"]>("todo");
  const current = TABS.find((t) => t.value === tab)!;
  const shown = orders.filter(current.match);
  const today = orders.filter((o) => (o.status === "paid" || o.status === "completed") && o.paidAt && new Date(o.paidAt).toDateString() === new Date().toDateString());
  return (
    <div className="mx-auto max-w-lg px-4 pt-5">
      <h1 className="text-3xl">Orders</h1>
      <p className="text-sm text-muted">
        Sold today: {money(today.reduce((n, o) => n + o.totalCents, 0))} ({today.length})
      </p>
      <div className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4">
        {TABS.map((t) => (
          <button key={t.value} type="button" onClick={() => setTab(t.value)} className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-bold ${tab === t.value ? "bg-ink text-paper" : "bg-kraft"}`}>
            {t.label} <span className="opacity-60">{orders.filter(t.match).length}</span>
          </button>
        ))}
      </div>
      <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-white">
        {shown.map((o) => {
          const [label, cls] = STATUS_LABEL[o.status];
          return (
            <li key={o.id}>
              <Link href={`/sell/orders/${o.id}`} className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{o.items.map((i) => i.title).join(", ")}</p>
                  <p className="text-sm text-muted">
                    #{o.number} · {o.customer.name ?? (o.channel === "in_person" ? "In person" : "—")} · {ago(o.createdAt)}
                    {o.method ? ` · ${PAY_METHOD_LABEL[o.method]}` : ""}
                    {o.fulfillment === "ship" ? " · Ship" : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold">{money(o.totalCents)}</p>
                  <span className={`rounded-md px-1.5 py-0.5 text-xs font-bold ${cls}`}>{label}</span>
                </div>
              </Link>
            </li>
          );
        })}
        {!shown.length && <li className="p-6 text-center text-muted">Nothing here.</li>}
      </ul>
    </div>
  );
}
