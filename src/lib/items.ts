import "server-only";
import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import { db, hasDatabase, photoUrl } from "./db";
import { SAMPLE_ITEMS } from "./sample";
import { slugify } from "./site";
export { availability } from "./availability";
import type { Channels, Condition, Item, ItemStatus, Photo, PublicItem } from "./types";

export const CATALOG_TAG = "catalog";

type Row = {
  id: string;
  slug: string;
  title: string;
  description: string;
  price_cents: number;
  compare_at_cents: number | null;
  condition: Condition;
  category: string;
  photos: { path: string; width?: number; height?: number }[] | null;
  status: ItemStatus;
  quantity: number;
  held_until: string | null;
  obo: boolean;
  pickup: boolean;
  ships: boolean;
  shipping_cents: number | null;
  featured: boolean;
  channels: Channels | null;
  notes: string;
  sold_at: string | null;
  sold_via: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export function toItem(r: Row): Item {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    description: r.description,
    priceCents: r.price_cents,
    compareAtCents: r.compare_at_cents,
    condition: r.condition,
    category: r.category,
    photos: (r.photos ?? []).map((p) => ({ path: p.path, url: photoUrl(p.path), width: p.width ?? 1200, height: p.height ?? 1200 })),
    status: r.status,
    quantity: r.quantity,
    heldUntil: r.held_until,
    obo: r.obo,
    pickup: r.pickup,
    ships: r.ships,
    shippingCents: r.shipping_cents,
    featured: r.featured,
    channels: r.channels ?? {},
    notes: r.notes,
    soldAt: r.sold_at,
    soldVia: r.sold_via,
    publishedAt: r.published_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const toPublic = ({ notes: _notes, ...rest }: Item): PublicItem => rest;

// ---------------------------------------------------------------------------
// The shop's catalog (cached; refreshed when anything changes in the Sell app)
// ---------------------------------------------------------------------------

const SOLD_SHOWN_DAYS = 14;

const loadCatalog = unstable_cache(
  async (): Promise<PublicItem[]> => {
    const since = new Date(Date.now() - SOLD_SHOWN_DAYS * 86_400_000).toISOString();
    const { data, error } = await db()
      .from("items")
      .select("*")
      .or(`status.eq.live,and(status.eq.sold,sold_at.gte.${since})`)
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(1000);
    if (error) throw new Error(`Couldn't load the catalog: ${error.message}`);
    return (data as Row[]).map(toItem).map(toPublic);
  },
  ["catalog-v1"],
  { tags: [CATALOG_TAG], revalidate: 600 },
);

/** Live items, plus what sold in the last two weeks (shown as Sold). Sample items until Supabase is set up. */
export async function getCatalog(): Promise<PublicItem[]> {
  if (!hasDatabase) return SAMPLE_ITEMS;
  return loadCatalog();
}

export async function getItemBySlug(slug: string): Promise<PublicItem | null> {
  const fromCatalog = (await getCatalog()).find((i) => i.slug === slug);
  if (fromCatalog || !hasDatabase) return fromCatalog ?? null;
  // Older sold items aren't in the cached catalog, but links to them should still work.
  const { data } = await db().from("items").select("*").eq("slug", slug).in("status", ["live", "sold"]).maybeSingle();
  return data ? toPublic(toItem(data as Row)) : null;
}

export const isSample = !hasDatabase;

/** Makes the shop show changes straight away. */
export function refreshShop() {
  revalidateTag(CATALOG_TAG, { expire: 0 });
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------------------
// The Sell app
// ---------------------------------------------------------------------------

export async function listItems({ status }: { status?: ItemStatus | "all" } = {}): Promise<Item[]> {
  let q = db().from("items").select("*").order("created_at", { ascending: false }).limit(2000);
  if (status && status !== "all") q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data as Row[]).map(toItem);
}

/** Sold in the last two weeks but listed on another site too: a reminder to mark it sold there. */
export function soldButListedElsewhere(items: Item[], now = Date.now()) {
  return items.filter((i) => i.status === "sold" && Object.keys(i.channels).length > 0 && i.soldAt && now - Date.parse(i.soldAt) < 14 * 86_400_000).map((i) => i.id);
}

export async function getItem(id: string): Promise<Item | null> {
  const { data, error } = await db().from("items").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toItem(data as Row) : null;
}

export type ItemInput = {
  title: string;
  description: string;
  priceCents: number;
  compareAtCents: number | null;
  condition: Condition;
  category: string;
  photos: Pick<Photo, "path" | "width" | "height">[];
  status: ItemStatus;
  quantity: number;
  obo: boolean;
  pickup: boolean;
  ships: boolean;
  shippingCents: number | null;
  featured: boolean;
  channels: Channels;
  notes: string;
};

export class InputError extends Error {
  status = 400;
}

const CONDITION_VALUES: Condition[] = ["new", "like_new", "good", "fair", "for_parts"];
const STATUS_VALUES: ItemStatus[] = ["draft", "live", "sold", "hidden"];
const CHANNEL_KEYS = ["facebook", "ebay", "craigslist", "offerup"] as const;

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const cents = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 100_000_000 ? Math.round(n) : null;
};

/** Checks what the Sell app sent. Missing fields fall back to `base` (an edit) or the defaults (a new item). */
export function parseItemInput(body: Record<string, unknown>, base?: Item): ItemInput {
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);
  const title = has("title") ? text(body.title, 120) : (base?.title ?? "");
  if (!title) throw new InputError("Give it a title.");
  const priceCents = has("priceCents") ? cents(body.priceCents) : (base?.priceCents ?? null);
  if (priceCents === null) throw new InputError("Give it a price (0 for free).");
  const condition = has("condition") ? (body.condition as Condition) : (base?.condition ?? "good");
  if (!CONDITION_VALUES.includes(condition)) throw new InputError("Pick a condition.");
  const status = has("status") ? (body.status as ItemStatus) : (base?.status ?? "live");
  if (!STATUS_VALUES.includes(status)) throw new InputError("Unknown status.");

  let photos = base?.photos.map(({ path, width, height }) => ({ path, width, height })) ?? [];
  if (has("photos")) {
    if (!Array.isArray(body.photos)) throw new InputError("Photos must be a list.");
    photos = body.photos.slice(0, 12).map((p) => {
      const path = text((p as Photo)?.path, 300);
      if (!/^[\w./-]+$/.test(path) || path.includes("..")) throw new InputError("A photo's path isn't valid.");
      const width = Math.round(Number((p as Photo).width) || 1200);
      const height = Math.round(Number((p as Photo).height) || 1200);
      return { path, width, height };
    });
  }
  if (status === "live" && !photos.length) throw new InputError("Add at least one photo before putting it in the shop (or save it as a draft).");

  let channels: Channels = base?.channels ?? {};
  if (has("channels") && body.channels && typeof body.channels === "object") {
    channels = {};
    for (const k of CHANNEL_KEYS) {
      const c = (body.channels as Record<string, Record<string, unknown>>)[k];
      if (!c || typeof c !== "object") continue;
      const url = text(c.url, 500);
      if (url && !/^https:\/\//i.test(url)) throw new InputError("Listing links must start with https://");
      const entry = { url: url || undefined, listedAt: text(c.listedAt, 40) || new Date().toISOString(), id: text(c.id, 100) || undefined };
      channels[k] = entry;
    }
  }

  const quantity = has("quantity") ? Math.max(0, Math.min(999, Math.round(Number(body.quantity)))) : (base?.quantity ?? 1);
  if (!Number.isFinite(quantity)) throw new InputError("Quantity must be a number.");

  return {
    title,
    description: has("description") ? text(body.description, 5000) : (base?.description ?? ""),
    priceCents,
    compareAtCents: has("compareAtCents") ? cents(body.compareAtCents) : (base?.compareAtCents ?? null),
    condition,
    category: has("category") ? text(body.category, 40) || "other" : (base?.category ?? "other"),
    photos,
    status,
    quantity,
    obo: has("obo") ? Boolean(body.obo) : (base?.obo ?? false),
    pickup: has("pickup") ? Boolean(body.pickup) : (base?.pickup ?? true),
    ships: has("ships") ? Boolean(body.ships) : (base?.ships ?? false),
    shippingCents: has("shippingCents") ? cents(body.shippingCents) : (base?.shippingCents ?? null),
    featured: has("featured") ? Boolean(body.featured) : (base?.featured ?? false),
    channels,
    notes: has("notes") ? text(body.notes, 2000) : (base?.notes ?? ""),
  };
}

function toRow(input: ItemInput, base?: Item) {
  const now = new Date().toISOString();
  const becameSold = input.status === "sold" && base?.status !== "sold";
  return {
    title: input.title,
    description: input.description,
    price_cents: input.priceCents,
    compare_at_cents: input.compareAtCents && input.compareAtCents > input.priceCents ? input.compareAtCents : null,
    condition: input.condition,
    category: input.category,
    photos: input.photos,
    status: input.status,
    // Back for sale after it sold: at least one again.
    quantity: input.status === "sold" ? 0 : base?.status === "sold" && input.quantity === 0 ? 1 : input.quantity,
    obo: input.obo,
    pickup: input.pickup || !input.ships,
    ships: input.ships,
    shipping_cents: input.shippingCents,
    featured: input.featured,
    channels: input.channels,
    notes: input.notes,
    published_at: input.status === "live" ? (base?.publishedAt ?? now) : (base?.publishedAt ?? null),
    sold_at: becameSold ? now : input.status === "sold" ? (base?.soldAt ?? now) : null,
    sold_via: becameSold ? "marked" : input.status === "sold" ? (base?.soldVia ?? null) : null,
    // Back in stock by hand: no hold left over.
    ...(input.status !== "sold" && input.quantity > 0 ? { held_until: null } : {}),
    updated_at: now,
  };
}

async function uniqueSlug(title: string, exceptId?: string) {
  const base = slugify(title);
  const { data } = await db().from("items").select("id, slug").like("slug", `${base}%`);
  const taken = new Set((data ?? []).filter((r) => r.id !== exceptId).map((r) => r.slug as string));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

export async function createItem(input: ItemInput): Promise<Item> {
  const slug = await uniqueSlug(input.title);
  const { data, error } = await db().from("items").insert({ ...toRow(input), slug }).select("*").single();
  if (error) throw new Error(error.message);
  refreshShop();
  return toItem(data as Row);
}

export async function updateItem(id: string, body: Record<string, unknown>): Promise<Item> {
  const base = await getItem(id);
  if (!base) throw new InputError("That item doesn't exist any more.");
  const input = parseItemInput(body, base);
  const row: Record<string, unknown> = toRow(input, base);
  // The link keeps working while it's only ever been a draft; once it's been in the shop, keep it.
  if (input.title !== base.title && !base.publishedAt) row.slug = await uniqueSlug(input.title, id);
  const { data, error } = await db().from("items").update(row).eq("id", id).select("*").single();
  if (error) throw new Error(error.message);
  refreshShop();
  return toItem(data as Row);
}

export async function deleteItem(id: string) {
  const item = await getItem(id);
  if (!item) return;
  const { error } = await db().from("items").delete().eq("id", id);
  if (error) throw new Error(error.message);
  const paths = item.photos.map((p) => p.path).filter((p) => !/^https?:/.test(p));
  if (paths.length) await db().storage.from("photos").remove(paths);
  refreshShop();
}
