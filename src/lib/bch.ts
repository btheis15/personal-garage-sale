import "server-only";
import { createBchCheckout as createEngine } from "./bch-engine/checkout.js";
import type { BchView as ScreenView } from "@/components/bch/types";
import { db } from "./db";
import { getOrder, markPaid } from "./orders";
import type { Order } from "./types";

/**
 * Bitcoin Cash, straight into your own wallet: the bch_cashtoken_checkout engine (src/lib/bch-engine),
 * with its storage in Supabase. You give it your wallet's xPub (BCH_XPUB): it can list the wallet's
 * addresses but can't spend. Each order gets its own address; the payment screen asks every few
 * seconds and the server looks at the blockchain itself (public Fulcrum servers), accepting the
 * payment at zero-conf after listening a few seconds for a double-spend proof.
 *
 * On Vercel nothing runs between requests, so the checks happen when the payment screen asks
 * (and from the daily cron for anything left over); coupons and rewards are left off.
 */
const xpub = () => process.env.BCH_XPUB?.trim() ?? "";
export const hasBch = () => /^xpub[1-9A-HJ-NP-Za-km-z]{100,}$/.test(xpub());

type AddressRow = {
  wallet: string;
  index: number;
  address: string;
  scripthash: string;
  state: "reserved" | "used" | "free";
  order_id: string | null;
  reserved_at: string | null;
  released_at: string | null;
};
const toAddress = (r: AddressRow) => ({
  wallet: r.wallet,
  index: r.index,
  address: r.address,
  scripthash: r.scripthash,
  state: r.state,
  orderId: r.order_id,
  reservedAt: r.reserved_at,
  releasedAt: r.released_at,
});

function must<T>({ data, error }: { data: T; error: { message: string } | null }): T {
  if (error) throw new Error(`BCH store: ${error.message}`);
  return data;
}

/** The engine's storage interface (see bch-engine/memory-store.js), in Supabase. */
export const supabaseStore = {
  async getPayment(id: string) {
    const row = must(await db().from("bch_payments").select("data").eq("id", id).maybeSingle());
    return row ? (row as { data: unknown }).data : null;
  },
  async putPayment(p: { id: string; createdAt: string }) {
    must(await db().from("bch_payments").upsert({ id: p.id, data: p, created_at: p.createdAt, updated_at: new Date().toISOString() }));
  },
  async listPayments({ since }: { since: string }) {
    const rows = must(await db().from("bch_payments").select("data").gte("created_at", since).limit(500));
    return ((rows ?? []) as { data: unknown }[]).map((r) => r.data);
  },
  async claimFreeAddress(wallet: string, orderId: string, reuseBefore: string, at: string) {
    const rows = must(await db().rpc("bch_claim_free_address", { p_wallet: wallet, p_order: orderId, p_reuse_before: reuseBefore, p_at: at })) as
      | (AddressRow & { previous_order_id: string | null; previous_released_at: string | null })[]
      | null;
    const r = rows?.[0];
    if (!r) return null;
    return { ...toAddress(r), previous: { orderId: r.previous_order_id, releasedAt: r.previous_released_at } };
  },
  async claimNewAddress(wallet: string, orderId: string, at: string, derive: (i: number) => { address: string; scripthash: string }) {
    const index = must(await db().rpc("bch_claim_new_index", { p_wallet: wallet, p_order: orderId, p_at: at })) as number;
    const a = derive(index);
    must(await db().from("bch_addresses").update({ address: a.address, scripthash: a.scripthash }).eq("wallet", wallet).eq("index", index));
    return { wallet, index, address: a.address, scripthash: a.scripthash, state: "reserved", orderId, reservedAt: at, releasedAt: null };
  },
  async setAddress(wallet: string, index: number, patch: { state?: string; orderId?: string | null; releasedAt?: string | null }) {
    const row: Record<string, unknown> = {};
    if (patch.state !== undefined) row.state = patch.state;
    if (patch.orderId !== undefined) row.order_id = patch.orderId;
    if (patch.releasedAt !== undefined) row.released_at = patch.releasedAt;
    must(await db().from("bch_addresses").update(row).eq("wallet", wallet).eq("index", index));
  },
  async releaseAddress(orderId: string, releasedAt: string | null) {
    must(await db().from("bch_addresses").update({ state: "free", released_at: releasedAt }).eq("order_id", orderId).eq("state", "reserved"));
  },
  async markAddressUsed(orderId: string) {
    must(await db().from("bch_addresses").update({ state: "used" }).eq("order_id", orderId));
  },
  async orderForScripthash(scripthash: string) {
    const r = must(await db().from("bch_addresses").select("order_id").eq("scripthash", scripthash).not("order_id", "is", null).order("reserved_at", { ascending: false }).limit(1).maybeSingle());
    return (r as { order_id: string } | null)?.order_id ?? null;
  },
  async unusedAhead(wallet: string) {
    const rows = (must(await db().from("bch_addresses").select("index, state").eq("wallet", wallet)) ?? []) as { index: number; state: string }[];
    const lastUsed = Math.max(-1, ...rows.filter((a) => a.state === "used").map((a) => a.index));
    return rows.filter((a) => a.index > lastUsed && a.state !== "used").length;
  },
  async getMeta(name: string) {
    const r = must(await db().from("bch_meta").select("value").eq("name", name).maybeSingle());
    return (r as { value: unknown } | null)?.value ?? null;
  },
  async putMeta(name: string, value: unknown) {
    must(await db().from("bch_meta").upsert({ name, value }));
  },
};

// The engine is plain JavaScript: these are the parts used here, with the payment screen's own types.
type Payment = { id: string; status: string; address: string; events?: { at: string; kind: string; message: string }[]; problems?: { kind: string; message: string; at: string }[] };
type Engine = {
  start(order: Record<string, unknown>): Promise<ScreenView>;
  check(id: string): Promise<ScreenView>;
  view(id: string): Promise<ScreenView>;
  renew(id: string): Promise<ScreenView>;
  close(id: string): Promise<ScreenView>;
  tick(): Promise<void>;
  walletInfo(id: string, address: string): Promise<unknown>;
  walletQuote(id: string, input: { category: string; amount: string }): Promise<unknown>;
  walletBuild(id: string, input: { address: string; category: string; amount: string }): Promise<unknown>;
  walletSubmit(id: string, hex: string): Promise<unknown>;
  payment(id: string): Promise<Payment | null>;
  firstAddress(): string;
};
const createBchCheckout = createEngine as unknown as (options: Record<string, unknown>) => Engine;
let engine: Engine | null = null;

export function bch(): Engine {
  if (!hasBch()) throw new Error("Bitcoin Cash isn't set up yet (BCH_XPUB).");
  engine ??= createBchCheckout({
    xpub: xpub(),
    store: supabaseStore,
    // The order is turned Paid in bchCheck() below, awaited, so it can't be lost when the function stops.
    onPaid: () => {},
    onNotice: (p: { id: string }, n: { message: string; problem: boolean }) => {
      if (n.problem) console.warn(`[bch] order ${p.id}: ${n.message}`);
    },
  });
  return engine;
}

export type BchView = ScreenView;

/** Starts the order's Bitcoin Cash payment (or returns the one already started). */
export async function bchStart(order: Order): Promise<BchView> {
  const existing = await bch().payment(order.id);
  if (existing) return bchCheck(order.id);
  return bch().start({
    id: order.id,
    label: `Order ${order.number}`,
    subtotalCents: order.subtotalCents,
    shippingCents: order.shippingCents,
    itemCount: order.items.reduce((n, i) => n + i.qty, 0),
    shippingLabel: order.shippingCents ? "Shipping" : null,
    number: order.number,
    items: order.items.map((i) => ({ title: i.title, option: null, qty: i.qty, unitCents: i.priceCents })),
  });
}

// The payment screen asks every few seconds; one look at the blockchain per order every 3 seconds is plenty.
const lastLook = new Map<string, { at: number; view: BchView }>();

/** Looks at the order's address and, once the payment counts, turns the order Paid. */
export async function bchCheck(orderId: string, { fresh = false } = {}): Promise<BchView> {
  const recent = lastLook.get(orderId);
  if (!fresh && recent && Date.now() - recent.at < 3000 && recent.view.state !== "arrived") return recent.view;
  const view = await bch().check(orderId);
  lastLook.set(orderId, { at: Date.now(), view });
  if (lastLook.size > 500) lastLook.delete(lastLook.keys().next().value!);
  if (view.state === "paid") {
    const order = await getOrder(orderId);
    if (order && order.status !== "paid" && order.status !== "completed") await markPaid(orderId, "bch");
  }
  return view;
}

/** Called by the daily cron: catches payments nobody was watching, and closes old ones. */
export async function bchTick() {
  if (!hasBch()) return;
  await bch().tick();
  // Anything the tick found paid gets its order turned Paid too.
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  for (const p of (await supabaseStore.listPayments({ since })) as { id: string; status: string }[]) {
    if (p.status !== "paid") continue;
    const order = await getOrder(p.id);
    if (order && (order.status === "pending" || order.status === "expired" || order.status === "cancelled")) await markPaid(p.id, "bch");
  }
}
