import "server-only";
import { revalidatePath, revalidateTag } from "next/cache";
import { SAMPLE_ITEMS } from "./sample";
import { DEFAULT_SETTINGS } from "./site";
import type { Payments, PublicItem, SiteSettings } from "./types";

/**
 * Everything comes from the garage sale's server on the Mac mini (the server/ folder), at
 * SHOP_API_URL (its DuckDNS address through Caddy). The website keeps a cached copy of the catalog,
 * so the shop stays up if the mini is briefly offline; the mini tells the site to refresh after
 * every change (/api/revalidate). With SHOP_API_URL blank the site shows sample items.
 */
const base = (process.env.SHOP_API_URL ?? "").replace(/\/$/, "");
export const hasShop = Boolean(base);
export const isSample = !hasShop;
export const CATALOG_TAG = "catalog";

export class ShopApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public itemIds?: string[],
    /** Which form fields are wrong (the "Spread the word" sign-up). */
    public errors?: Record<string, string>,
  ) {
    super(message);
  }
}

type Options = { method?: string; body?: unknown; admin?: boolean; shopperIp?: string | null; raw?: BodyInit; contentType?: string };

/** One request to the Mac mini, from this site's server (never the browser), with the right token. */
export async function shopApi<T = Record<string, unknown>>(path: string, { method = "GET", body, admin = false, shopperIp, raw, contentType }: Options = {}): Promise<T> {
  if (!hasShop) throw new ShopApiError("The shop's server isn't connected yet (SHOP_API_URL).", 503);
  const token = admin ? process.env.SHOP_ADMIN_TOKEN : process.env.SHOP_API_TOKEN;
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token ?? ""}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : contentType ? { "Content-Type": contentType } : {}),
        ...(shopperIp ? { "X-Shopper-IP": shopperIp } : {}),
      },
      body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
      cache: "no-store",
      signal: AbortSignal.timeout(admin ? 60_000 : 30_000),
      // Streaming a photo upload through.
      ...(raw ? { duplex: "half" } : {}),
    } as RequestInit);
  } catch {
    throw new ShopApiError("Can't reach the shop's server right now. Please try again in a minute.", 503);
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; itemIds?: string[]; errors?: Record<string, string> };
  if (!res.ok) throw new ShopApiError(data.error ?? `The shop's server answered ${res.status}.`, res.status, data.itemIds, data.errors);
  return data;
}

/** The visitor's address, passed on so the mini's rate limits are per person. */
export const shopperIp = (headers: Headers) => headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || null;

type Catalog = { items: PublicItem[]; settings: SiteSettings; payments: Payments };

const SAMPLE: Catalog = { items: SAMPLE_ITEMS, settings: DEFAULT_SETTINGS, payments: { stripe: false, stripeTest: false, bch: false } };

/**
 * The whole (small) catalog in one cached request. If the mini is unreachable this throws, so
 * Next keeps serving the last good pages instead of an empty shop.
 */
async function catalog(): Promise<Catalog> {
  if (!hasShop) return SAMPLE;
  const res = await fetch(`${base}/api/catalog`, {
    headers: { Authorization: `Bearer ${process.env.SHOP_API_TOKEN ?? ""}` },
    next: { revalidate: 300, tags: [CATALOG_TAG] },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Catalog request failed: ${res.status}`);
  const data = (await res.json()) as Catalog;
  return { ...data, settings: { ...DEFAULT_SETTINGS, ...data.settings } };
}

export const getCatalog = async () => (await catalog()).items;
export const getSettings = async () => (await catalog()).settings;
export const getPayments = async () => (await catalog()).payments;

export async function getItemBySlug(slug: string): Promise<PublicItem | null> {
  const found = (await getCatalog()).find((i) => i.slug === slug);
  if (found || !hasShop) return found ?? null;
  // Older sold items aren't in the catalog, but links to them should still work.
  const res = await fetch(`${base}/api/item/${encodeURIComponent(slug)}`, {
    headers: { Authorization: `Bearer ${process.env.SHOP_API_TOKEN ?? ""}` },
    next: { revalidate: 300, tags: [CATALOG_TAG] },
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  return res?.ok ? ((await res.json()) as { item: PublicItem | null }).item : null;
}

/** Fresh from the mini (not cached): checkout and the Sell app. */
export async function freshSettings(): Promise<{ settings: SiteSettings; payments: Payments }> {
  if (!hasShop) return SAMPLE;
  const c = await shopApi<Catalog>("/api/catalog");
  return { settings: { ...DEFAULT_SETTINGS, ...c.settings }, payments: c.payments };
}

/** Is the mini answering? (The refresh only drops cached pages once it is.) */
export async function isShopReachable() {
  if (!hasShop) return true;
  try {
    const res = await fetch(`${base}/api/catalog`, { headers: { Authorization: `Bearer ${process.env.SHOP_API_TOKEN ?? ""}` }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    return res.ok;
  } catch {
    return false;
  }
}

export function refreshShop() {
  revalidateTag(CATALOG_TAG, { expire: 0 });
  revalidatePath("/", "layout");
}
