import "server-only";
import { unstable_cache } from "next/cache";
import { db, hasDatabase } from "./db";
import { CATALOG_TAG, InputError, refreshShop } from "./items";
import { DEFAULT_SETTINGS } from "./site";
import type { SiteSettings } from "./types";

const loadSettings = unstable_cache(
  async (): Promise<SiteSettings> => {
    const { data, error } = await db().from("settings").select("value").eq("key", "site").maybeSingle();
    if (error) throw new Error(error.message);
    return { ...DEFAULT_SETTINGS, ...((data?.value as Partial<SiteSettings>) ?? {}) };
  },
  ["settings-v1"],
  { tags: [CATALOG_TAG], revalidate: 3600 },
);

/** The shop's settings (Sell app → Settings), over the defaults in site.ts. */
export async function getSettings(): Promise<SiteSettings> {
  if (!hasDatabase) return DEFAULT_SETTINGS;
  return loadSettings();
}

/** Fresh, not cached: for the Sell app and checkout. */
export async function readSettings(): Promise<SiteSettings> {
  if (!hasDatabase) return DEFAULT_SETTINGS;
  const { data } = await db().from("settings").select("value").eq("key", "site").maybeSingle();
  return { ...DEFAULT_SETTINGS, ...((data?.value as Partial<SiteSettings>) ?? {}) };
}

const TEXT_LIMITS: Partial<Record<keyof SiteSettings, number>> = {
  name: 60,
  tagline: 140,
  about: 3000,
  pickupArea: 120,
  pickupInstructions: 2000,
  contactEmail: 120,
  contactPhone: 40,
  venmo: 60,
  announcement: 140,
};

export async function saveSettings(body: Record<string, unknown>): Promise<SiteSettings> {
  const current = await readSettings();
  const next: SiteSettings = { ...current };
  for (const [k, max] of Object.entries(TEXT_LIMITS) as [keyof SiteSettings, number][]) {
    if (typeof body[k] === "string") (next as Record<string, unknown>)[k] = (body[k] as string).trim().slice(0, max);
  }
  if (!next.name) throw new InputError("The shop needs a name.");
  if (next.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.contactEmail)) throw new InputError("That email address doesn't look right.");
  for (const k of ["payAtPickup", "shipping"] as const) if (typeof body[k] === "boolean") next[k] = body[k] as boolean;
  if (body.payAtPickupHours !== undefined) {
    const h = Math.round(Number(body.payAtPickupHours));
    if (!(h >= 1 && h <= 336)) throw new InputError("Hold pay-at-pickup items for 1 to 336 hours.");
    next.payAtPickupHours = h;
  }
  if (body.defaultShippingCents !== undefined) {
    const c = Math.round(Number(body.defaultShippingCents));
    if (!(c >= 0 && c <= 100_000)) throw new InputError("Shipping must be between $0 and $1,000.");
    next.defaultShippingCents = c;
  }
  const { error } = await db().from("settings").upsert({ key: "site", value: next, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  refreshShop();
  return next;
}
