"use client";

import { useSyncExternalStore } from "react";

/**
 * The buyer's open orders (a hold for pickup, or a payment still going), remembered on this device so
 * they can get back to them: to see the pickup details, pay, or cancel the hold. Without this, closing
 * the order page left the item "On hold" with no way back to it (the email has the link too, when
 * emails are on). The order id is the order's own unguessable id, the same one in the order page's URL.
 */
export type MyOrder = { id: string; number: number; status: "pending" | "reserved"; itemIds: string[]; holdUntil: string | null };

const KEY = "garage-sale-orders-v1";
const EMPTY: MyOrder[] = [];
let cache: MyOrder[] | null = null;
const listeners = new Set<() => void>();

function read(): MyOrder[] {
  if (cache) return cache;
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    cache = Array.isArray(list) ? list.filter((o) => o && typeof o.id === "string") : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(list: MyOrder[]) {
  cache = list;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* private mode: kept for this visit only */
  }
  listeners.forEach((l) => l());
}

/** Held orders whose hold has run out are gone (the items are back in the shop). */
const live = (o: MyOrder) => !o.holdUntil || Date.parse(o.holdUntil) > Date.now();

export const myOrders = {
  /** After the order page loads or changes: remember it while it's open, forget it once it isn't. */
  track(o: { id: string; number: number; status: string; items: { id: string }[]; holdUntil?: string | null }) {
    const rest = read().filter((x) => x.id !== o.id);
    if (o.status === "pending" || o.status === "reserved")
      write([{ id: o.id, number: o.number, status: o.status as MyOrder["status"], itemIds: o.items.map((i) => i.id), holdUntil: o.holdUntil ?? null }, ...rest].slice(0, 10));
    else if (rest.length !== read().length) write(rest);
  },
  forget(id: string) {
    write(read().filter((x) => x.id !== id));
  },
};

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    cache = null;
    cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useMyOrders(): MyOrder[] {
  const list = useSyncExternalStore(subscribe, read, () => EMPTY);
  return list.filter(live);
}
