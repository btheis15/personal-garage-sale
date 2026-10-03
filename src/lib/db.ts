import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The server's Supabase client, with the service-role key: it can read and write everything, so it
 * only ever runs on the server. Null when Supabase isn't set up yet (the shop shows sample items).
 */
const url = process.env.SUPABASE_URL?.replace(/\/$/, "") ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export const hasDatabase = Boolean(url && key);

let client: SupabaseClient | null = null;
export function db(): SupabaseClient {
  if (!hasDatabase) throw new NotConfigured("Supabase isn't set up yet: add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see README).");
  client ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

export class NotConfigured extends Error {
  status = 503;
}

export const PHOTO_BUCKET = "photos";

/** A photo's public address (sample photos are already full URLs). */
export function photoUrl(path: string) {
  if (/^https?:\/\//.test(path) || path.startsWith("/")) return path;
  return `${url}/storage/v1/object/public/${PHOTO_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;
}
