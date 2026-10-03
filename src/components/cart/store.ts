"use client";

import { useSyncExternalStore } from "react";

export type CartItem = {
  id: string;
  slug: string;
  title: string;
  priceCents: number;
  photo?: string;
  qty: number;
  /** How many there are. */
  maxQty: number;
  ships: boolean;
  pickup: boolean;
  /** The item's shipping price, when it has its own. */
  shippingEstimate?: number;
};

type State = { items: CartItem[]; open: boolean };

const KEY = "garage-sale-cart-v1";
const EMPTY: State = { items: [], open: false };
let state: State = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) state = { ...state, items: JSON.parse(raw) as CartItem[] };
  } catch {
    /* storage unavailable (private mode): the cart still works in memory */
  }
}

function set(next: Partial<State>) {
  state = { ...state, ...next };
  if (next.items) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state.items));
    } catch {
      /* ignore */
    }
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  load();
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    loaded = false;
    load();
    listeners.forEach((l) => l());
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const clamp = (qty: number, max: number) => Math.max(0, Math.min(qty, max));

export const cart = {
  add(item: Omit<CartItem, "qty">, qty = 1) {
    load();
    const existing = state.items.find((i) => i.id === item.id);
    const items = existing
      ? state.items.map((i) => (i.id === item.id ? { ...i, ...item, qty: clamp(i.qty + qty, item.maxQty) } : i))
      : [...state.items, { ...item, qty: clamp(qty, item.maxQty) }];
    set({ items, open: true });
  },
  setQty(id: string, qty: number) {
    set({ items: state.items.map((i) => (i.id === id ? { ...i, qty: clamp(qty, i.maxQty) } : i)).filter((i) => i.qty > 0) });
  },
  remove(id: string) {
    set({ items: state.items.filter((i) => i.id !== id) });
  },
  removeMany(ids: string[]) {
    set({ items: state.items.filter((i) => !ids.includes(i.id)) });
  },
  clear() {
    set({ items: [] });
  },
  open() {
    set({ open: true });
  },
  close() {
    set({ open: false });
  },
};

export function useCart() {
  const s = useSyncExternalStore(
    subscribe,
    () => (load(), state),
    () => EMPTY,
  );
  const count = s.items.reduce((n, i) => n + i.qty, 0);
  const subtotal = s.items.reduce((n, i) => n + i.qty * i.priceCents, 0);
  return { ...s, count, subtotal };
}
