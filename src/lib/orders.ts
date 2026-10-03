import "server-only";
import { db, photoUrl } from "./db";
import { InputError, refreshShop } from "./items";
import { notifyPaid, notifyReserved } from "./notify";
import type { Customer, Order, OrderLine, OrderStatus, PayMethod } from "./types";

type Row = {
  id: string;
  number: number;
  status: OrderStatus;
  method: PayMethod | null;
  channel: "web" | "in_person";
  items: OrderLine[];
  subtotal_cents: number;
  shipping_cents: number;
  total_cents: number;
  fulfillment: "pickup" | "ship";
  customer: Customer | null;
  stripe_session_id: string | null;
  hold_until: string | null;
  paid_at: string | null;
  completed_at: string | null;
  notes: string;
  created_at: string;
};

export function toOrder(r: Row): Order {
  return {
    id: r.id,
    number: Number(r.number),
    status: r.status,
    method: r.method,
    channel: r.channel,
    items: r.items ?? [],
    subtotalCents: r.subtotal_cents,
    shippingCents: r.shipping_cents,
    totalCents: r.total_cents,
    fulfillment: r.fulfillment,
    customer: r.customer ?? {},
    stripeSessionId: r.stripe_session_id,
    holdUntil: r.hold_until,
    paidAt: r.paid_at,
    completedAt: r.completed_at,
    notes: r.notes,
    createdAt: r.created_at,
  };
}

export const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export async function getOrder(id: string): Promise<Order | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await db().from("orders").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toOrder(data as Row) : null;
}

export async function getOrderBySession(sessionId: string): Promise<Order | null> {
  const { data } = await db().from("orders").select("*").eq("stripe_session_id", sessionId).maybeSingle();
  return data ? toOrder(data as Row) : null;
}

export async function listOrders({ limit = 200 }: { limit?: number } = {}): Promise<Order[]> {
  await db().rpc("expire_stale_orders");
  const { data, error } = await db().from("orders").select("*").order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data as Row[]).map(toOrder);
}

export class Unavailable extends Error {
  status = 409;
  constructor(
    message: string,
    public itemIds: string[],
  ) {
    super(message);
  }
}

/**
 * Creates an order and takes its items out of stock, all at once in the database (place_order),
 * so two buyers can never get the last one. Prices always come from the database, never the browser.
 */
export async function placeOrder({
  lines,
  status = "pending",
  method,
  channel = "web",
  fulfillment = "pickup",
  customer = {},
  holdMinutes,
  defaultShippingCents = 0,
}: {
  lines: { id: string; qty: number }[];
  status?: "pending" | "reserved";
  method: PayMethod | null;
  channel?: "web" | "in_person";
  fulfillment?: "pickup" | "ship";
  customer?: Customer;
  holdMinutes: number | null;
  defaultShippingCents?: number;
}): Promise<Order> {
  const clean = lines.filter((l) => isUuid(l.id)).map((l) => ({ id: l.id, qty: Math.max(1, Math.min(99, Math.round(l.qty) || 1)) }));
  if (!clean.length) throw new InputError("Your cart is empty.");
  const { data, error } = await db().rpc("place_order", {
    p_lines: clean,
    p_status: status,
    p_method: method,
    p_channel: channel,
    p_fulfillment: fulfillment,
    p_customer: customer,
    p_hold_minutes: holdMinutes,
    p_default_shipping_cents: defaultShippingCents,
  });
  if (error) {
    const m = /(unavailable|noship):([0-9a-f-]{36})/.exec(error.message);
    if (m?.[1] === "unavailable") throw new Unavailable("Sorry, something in your cart just sold or is on hold.", [m[2]]);
    if (m?.[1] === "noship") throw new InputError("One of the items is pickup only.");
    if (error.message.includes("empty")) throw new InputError("Your cart is empty.");
    throw new Error(error.message);
  }
  refreshShop();
  const order = toOrder(data as Row);
  if (status === "reserved") await notifyReserved(order).catch((e) => console.error("[notify]", e));
  return order;
}

export async function setOrderFields(id: string, fields: Record<string, unknown>) {
  const { error } = await db().from("orders").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Marks the order paid (once: the second call for the same order does nothing and returns null). */
export async function markPaid(id: string, method: PayMethod | null, paymentIntent: string | null = null): Promise<Order | null> {
  const { data, error } = await db().rpc("mark_order_paid", { p_order: id, p_method: method, p_payment_intent: paymentIntent });
  if (error) throw new Error(error.message);
  // A null composite comes back as an object of nulls.
  if (!data || !(data as Row).id) return null;
  const order = toOrder(data as Row);
  refreshShop();
  await notifyPaid(order).catch((e) => console.error("[notify]", e));
  return order;
}

/** Puts an unpaid order's items back (cancelled by you or the buyer, or its hold ran out). */
export async function releaseOrder(id: string, status: "cancelled" | "expired" = "cancelled") {
  const { data, error } = await db().rpc("release_order", { p_order: id, p_status: status });
  if (error) throw new Error(error.message);
  if (data) refreshShop();
  return Boolean(data);
}

export async function completeOrder(id: string) {
  const { error } = await db()
    .from("orders")
    .update({ status: "completed", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "paid");
  if (error) throw new Error(error.message);
}

/** What the buyer's order page shows (no private notes). */
export function buyerView(o: Order) {
  return {
    id: o.id,
    number: o.number,
    status: o.status,
    method: o.method,
    channel: o.channel,
    items: o.items.map((i) => ({ ...i, photoUrl: i.photo ? photoUrl(i.photo) : null })),
    subtotalCents: o.subtotalCents,
    shippingCents: o.shippingCents,
    totalCents: o.totalCents,
    fulfillment: o.fulfillment,
    holdUntil: o.holdUntil,
    paidAt: o.paidAt,
    name: o.customer.name ?? null,
  };
}
export type BuyerOrder = ReturnType<typeof buyerView>;
